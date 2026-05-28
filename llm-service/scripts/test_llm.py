#!/usr/bin/env python3
"""Прогон одного или N примеров из dataset.jsonl через LlamaCppClient напрямую.

  uv run python scripts/test_llm.py
  uv run python scripts/test_llm.py --n 5
  uv run python scripts/test_llm.py --not-important
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import time

from mock_categories import CATEGORIES
from models.llm import LlamaCppClient
from models.llm.load import DEFAULT_QUANT, DEFAULT_REPO, resolve_model_path
from paths import DATASET_PATH
from service.pipeline import run_analyze


def load_examples(important: bool) -> list[dict]:
    out = []
    with open(DATASET_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            if ex.get("__meta__") or "messages" not in ex:
                continue
            answer = json.loads(ex["messages"][1]["content"])
            if answer["is_important"] == important:
                out.append(ex)
    return out


def compare(expected: dict, actual: dict) -> dict[str, bool]:
    results = {"is_important": expected.get("is_important") == actual.get("is_important")}
    if expected.get("is_important"):
        results["category_id"] = (expected.get("category") or {}).get("id") == (actual.get("category") or {}).get("id")
        results["subcategory_id"] = (expected.get("subcategory") or {}).get("id") == (actual.get("subcategory") or {}).get("id")
        results["formalized_nonempty"] = bool(actual.get("formalized_text"))
    else:
        results["category_null"] = actual.get("category") is None
    return results


async def run_one(client: LlamaCppClient, categories: list[dict], example: dict, idx: int, total: int) -> bool:
    text = example["messages"][0]["content"]
    expected = json.loads(example["messages"][1]["content"])

    print(f"\n{'═' * 60}")
    print(f"  Example {idx}/{total}  |  is_important={expected['is_important']}")
    if expected.get("category"):
        print(f"  Category:    [{expected['category']['id']}] {expected['category']['name']}")
    if expected.get("subcategory"):
        print(f"  Subcategory: [{expected['subcategory']['id']}] {expected['subcategory']['name']}")
    print(f"{'═' * 60}")
    print(f"INPUT:\n  {text}\n")

    print("Sending to LLM...", flush=True)
    t0 = time.time()
    actual = await run_analyze(client, text, categories)
    elapsed = time.time() - t0

    print(f"Response ({elapsed:.1f}s):\n  {json.dumps(actual, ensure_ascii=False)}\n")
    print("EXPECTED:")
    print(f"  {json.dumps(expected, ensure_ascii=False)}\n")

    checks = compare(expected, actual)
    all_ok = all(checks.values())

    def icon(ok: bool) -> str:
        return "✅" if ok else "❌"

    print("CHECKS:")
    for k, v in checks.items():
        print(f"  {icon(v)} {k}")

    return all_ok


async def amain() -> None:
    parser = argparse.ArgumentParser(description="Test LLM on dataset examples")
    parser.add_argument("--not-important", action="store_true")
    parser.add_argument("--n", type=int, default=1)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--repo", default=os.getenv("LLM_REPO", DEFAULT_REPO))
    parser.add_argument("--quant", default=os.getenv("LLM_QUANT", DEFAULT_QUANT))
    parser.add_argument("--n-gpu-layers", type=int, default=int(os.getenv("LLM_N_GPU_LAYERS", "0")))
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    gguf = resolve_model_path(args.repo, args.quant)
    print(f"LLM: {gguf}")

    examples = load_examples(important=not args.not_important)
    if not examples:
        print("No examples found.")
        return

    sample = random.sample(examples, min(args.n, len(examples)))
    client = LlamaCppClient(model_path=gguf, n_gpu_layers=args.n_gpu_layers)

    try:
        passed = 0
        for i, ex in enumerate(sample, 1):
            if await run_one(client, CATEGORIES, ex, i, len(sample)):
                passed += 1

        if args.n > 1:
            print(f"\n{'═' * 60}")
            print(f"SUMMARY: {passed}/{len(sample)} passed")
            print(f"{'═' * 60}")
    finally:
        client.close()


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
