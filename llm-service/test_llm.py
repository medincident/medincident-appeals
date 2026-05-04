#!/usr/bin/env python3
"""
Test script: picks a random example from dataset.jsonl, sends it to Ollama,
compares result with expected output.

Usage:
    python3 test_llm.py                    # pick random IMPORTANT example
    python3 test_llm.py --not-important    # pick random NOT IMPORTANT example
    python3 test_llm.py --url http://...   # custom Ollama URL (auto-detected by default)
    python3 test_llm.py --n 5              # run 5 examples and show summary
"""

import argparse
import json
import random
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "categories-service-mock"))
from categories import CATEGORIES  # noqa: E402

DATASET_PATH = PROJECT_ROOT / "dataset.jsonl"
DEFAULT_MODEL = "qwen2.5:3b"

SYSTEM_PROMPT = (
    "Проанализируй обращение пациента и верни JSON строго по схеме без markdown и лишнего текста.\n"
    'Схема: {"is_important": bool, "reason": str, "formalized_text": str, '
    '"theses": [str], "category": {"id": str, "name": str} | null, '
    '"subcategory": {"id": str, "name": str} | null}\n'
    "is_important=true только если сообщение содержит жалобу на здоровье, "
    "условия пребывания, поведение персонала или безопасность. "
    "Категорию и подкатегорию выбирай строго из списка в обращении пациента."
)


def build_categories_block(categories: list, *, with_descriptions: bool = False) -> str:
    lines = ["Доступные категории инцидентов:"]
    for cat in categories:
        cat_line = f"- [{cat['id']}] {cat['name']}"
        if with_descriptions:
            cat_line += f": {cat['description']}"
        lines.append(cat_line)
        for sub in cat.get("subcategories", []):
            sub_line = f"    • [{sub['id']}] {sub['name']}"
            if with_descriptions:
                sub_line += f": {sub['description']}"
            lines.append(sub_line)
    return "\n".join(lines)


def decorate_complaint(complaint: str) -> str:
    """Добавляет к обращению список категорий (как делает backend в runtime)."""
    cats_block = build_categories_block(CATEGORIES)  # compact: ~350 токенов вместо ~1000
    return f"Обращение пациента:\n{complaint}\n\n{cats_block}"


def get_container_ip(container_name: str) -> str | None:
    try:
        result = subprocess.run(
            ["docker", "inspect", container_name],
            capture_output=True, text=True, timeout=5
        )
        data = json.loads(result.stdout)
        nets = data[0]["NetworkSettings"]["Networks"]
        return next(iter(nets.values()))["IPAddress"]
    except Exception:
        return None


def detect_llm_url() -> str:
    ip = get_container_ip("ai-medincident-llm")
    if ip:
        return f"http://{ip}:11434"
    return "http://localhost:11434"


def load_examples(important: bool) -> list[dict]:
    examples = []
    with open(DATASET_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            assistant = json.loads(ex["messages"][1]["content"])  # [0]=user, [1]=assistant
            if assistant["is_important"] == important:
                examples.append(ex)
    return examples


def call_llm(url: str, model: str, messages: list[dict]) -> tuple[str, float]:
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{url}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as resp:
        body = json.loads(resp.read())
    elapsed = time.time() - t0

    content = body["choices"][0]["message"]["content"].strip()
    return content, elapsed


def compare(expected: dict, actual: dict) -> dict[str, bool]:
    results = {}
    results["is_important"] = expected.get("is_important") == actual.get("is_important")

    if expected.get("is_important"):
        exp_cat = (expected.get("category") or {}).get("id")
        act_cat = (actual.get("category") or {}).get("id")
        results["category_id"] = exp_cat == act_cat

        exp_sub = (expected.get("subcategory") or {}).get("id")
        act_sub = (actual.get("subcategory") or {}).get("id")
        results["subcategory_id"] = exp_sub == act_sub

        act_theses = set(actual.get("theses") or [])
        results["theses_nonempty"] = len(act_theses) > 0
        results["formalized_nonempty"] = bool(actual.get("formalized_text"))
    else:
        results["category_null"] = actual.get("category") is None

    return results


def run_example(url: str, model: str, example: dict, idx: int, total: int) -> bool:
    msgs = example["messages"]
    # dataset содержит только user + assistant; system + categories добавляем здесь динамически
    raw_complaint = msgs[0]["content"]
    expected = json.loads(msgs[1]["content"])

    decorated = decorate_complaint(raw_complaint)

    print(f"\n{'═'*60}")
    print(f"  Example {idx}/{total}  |  is_important={expected['is_important']}")
    if expected.get("category"):
        print(f"  Category: [{expected['category']['id']}] {expected['category']['name']}")
    if expected.get("subcategory"):
        print(f"  Subcategory: [{expected['subcategory']['id']}] {expected['subcategory']['name']}")
    print(f"{'═'*60}")
    print(f"INPUT:\n  {raw_complaint}\n")

    system_msg = {"role": "system", "content": SYSTEM_PROMPT}
    user_msg = {"role": "user", "content": decorated}

    print("Sending to LLM...", flush=True)
    raw_output, elapsed = call_llm(url, model, [system_msg, user_msg])

    print(f"Response ({elapsed:.1f}s):\n  {raw_output}\n")

    try:
        actual = json.loads(raw_output)
        valid_json = True
    except json.JSONDecodeError as e:
        print(f"  [!] Invalid JSON: {e}")
        actual = {}
        valid_json = False

    print("EXPECTED:")
    print(f"  {json.dumps(expected, ensure_ascii=False)}\n")

    checks = compare(expected, actual)
    all_ok = valid_json and all(checks.values())

    print("CHECKS:")
    def icon(ok: bool) -> str:
        return "✅" if ok else "❌"
    print(f"  {icon(valid_json)} valid JSON")
    for k, v in checks.items():
        print(f"  {icon(v)} {k}")

    return all_ok


def main():
    parser = argparse.ArgumentParser(description="Test LLM against dataset examples")
    parser.add_argument("--not-important", action="store_true",
                        help="Use NOT important examples (default: important)")
    parser.add_argument("--url", default=None,
                        help="Ollama base URL (auto-detected if omitted)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--n", type=int, default=1,
                        help="Number of examples to test (default: 1)")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    url = args.url or detect_llm_url()
    print(f"LLM URL: {url}")
    print(f"Model:   {args.model}")

    important = not args.not_important
    examples = load_examples(important)
    if not examples:
        print("No examples found for the selected filter.")
        return

    sample = random.sample(examples, min(args.n, len(examples)))

    passed = 0
    for i, ex in enumerate(sample, 1):
        ok = run_example(url, args.model, ex, i, len(sample))
        if ok:
            passed += 1

    if args.n > 1:
        print(f"\n{'═'*60}")
        print(f"SUMMARY: {passed}/{len(sample)} passed")
        print(f"{'═'*60}")


if __name__ == "__main__":
    main()
