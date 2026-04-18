#!/usr/bin/env python3
"""
benchmark_llm.py — полный бенчмарк Qwen2.5-3B (zero-shot) на test set.

Запуск:
  python3 benchmark_llm.py              # 30 примеров (~55 мин CPU / ~3 мин GPU)
  python3 benchmark_llm.py --limit 50   # 50 примеров
  python3 benchmark_llm.py --limit 0    # все 447 (~14 часов CPU)

Требования: Docker контейнер ai-medincident-llm должен быть запущен.
  docker compose up llm-service -d

Измеряет:
  1. Качество: is_important (F1-macro), category/subcategory accuracy, ROUGE, valid JSON rate
  2. Latency: per-request avg, p50, p95, total
  3. Memory: Docker контейнер stats
"""

import argparse
import json
import logging
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH = Path(__file__).parent / "dataset.jsonl"
DEFAULT_MODEL = "qwen2.5:3b"

sys.path.insert(0, str(Path(__file__).parent / "categories-service"))
from categories import CATEGORIES  # noqa: E402

SYSTEM_PROMPT = (
    "Проанализируй обращение пациента и верни JSON строго по схеме без markdown и лишнего текста.\n"
    '{"is_important": bool, "reason": str, "formalized_text": str, '
    '"theses": [str], "category": {"id": str, "name": str} | null, '
    '"subcategory": {"id": str, "name": str} | null}\n'
    "is_important=true только если сообщение содержит жалобу на здоровье, "
    "условия пребывания, поведение персонала или безопасность. "
    "Категорию и подкатегорию выбирай строго из списка в обращении пациента."
)


def build_categories_block(categories):
    lines = ["Доступные категории инцидентов:"]
    for cat in categories:
        lines.append(f"- [{cat['id']}] {cat['name']}")
        for sub in cat.get("subcategories", []):
            lines.append(f"    * [{sub['id']}] {sub['name']}")
    return "\n".join(lines)


def get_container_ip(container_name):
    try:
        result = subprocess.run(
            ["docker", "inspect", container_name],
            capture_output=True, text=True, timeout=5,
        )
        data = json.loads(result.stdout)
        nets = data[0]["NetworkSettings"]["Networks"]
        return next(iter(nets.values()))["IPAddress"]
    except Exception:
        return None


def detect_llm_url():
    ip = get_container_ip("ai-medincident-llm")
    if ip:
        return f"http://{ip}:11434"
    return "http://localhost:11434"


def get_container_memory(container_name="ai-medincident-llm"):
    """Получить потребление памяти Docker контейнера."""
    try:
        result = subprocess.run(
            ["docker", "stats", container_name, "--no-stream", "--format",
             "{{.MemUsage}} | {{.MemPerc}}"],
            capture_output=True, text=True, timeout=10,
        )
        return result.stdout.strip()
    except Exception:
        return "N/A"


def get_model_size(container_name="ai-medincident-llm"):
    """Получить размер модели внутри Docker контейнера."""
    try:
        result = subprocess.run(
            ["docker", "exec", container_name, "du", "-sh",
             "/root/.ollama/models/"],
            capture_output=True, text=True, timeout=10,
        )
        return result.stdout.strip().split("\t")[0]
    except Exception:
        return "~1.9 GB (Q4_K_M)"


def call_llm(url, model, messages):
    payload = json.dumps({
        "model": model, "messages": messages, "stream": False,
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


def load_test_set():
    sys.path.insert(0, str(Path(__file__).parent / "nlp-service"))
    from train_classifier import load_dataset, split_by_templates

    texts, labels, template_ids = load_dataset(DATASET_PATH)
    _, _, test_idx = split_by_templates(template_ids)

    all_answers = []
    with open(DATASET_PATH, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            all_answers.append(json.loads(ex["messages"][1]["content"]))

    test_texts = [texts[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]
    test_answers = [all_answers[i] for i in test_idx]
    return test_texts, test_labels, test_answers


def main():
    parser = argparse.ArgumentParser(description="Benchmark Qwen2.5-3B (zero-shot) on test set")
    parser.add_argument("--limit", type=int, default=30, help="Number of test examples (0=all)")
    parser.add_argument("--url", default=None, help="Ollama URL (auto-detected)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    url = args.url or detect_llm_url()
    logger.info("LLM URL: %s, model: %s", url, args.model)

    # Проверка доступности LLM
    try:
        check_url = f"{url}/v1/models"
        with urllib.request.urlopen(check_url, timeout=5):
            pass
        logger.info("LLM service is reachable")
    except Exception as e:
        logger.error("Cannot reach LLM at %s: %s", url, e)
        logger.error("Start it with: docker compose up llm-service -d")
        sys.exit(1)

    test_texts, test_labels, test_answers = load_test_set()
    if args.limit > 0:
        test_texts = test_texts[:args.limit]
        test_labels = test_labels[:args.limit]
        test_answers = test_answers[:args.limit]

    logger.info("Test: %d examples (imp=%d, not=%d)",
                len(test_texts), sum(test_labels), len(test_labels) - sum(test_labels))

    cats_block = build_categories_block(CATEGORIES)

    from rouge_score import rouge_scorer
    from sklearn.metrics import f1_score

    class _WS:
        def tokenize(self, text):
            return text.lower().split()

    scorer = rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"], use_stemmer=False, tokenizer=_WS(),
    )

    # Accumulators
    all_preds_imp = []  # predicted is_important
    all_true_imp = []   # true is_important
    cat_correct, cat_total = 0, 0
    sub_correct, sub_total = 0, 0
    valid_json_count = 0
    invalid_json_count = 0
    failed_count = 0
    form_r1, form_r2, form_rl = [], [], []
    thes_r1, thes_r2, thes_rl = [], [], []
    latencies = []

    for i, (text, label, expected) in enumerate(zip(test_texts, test_labels, test_answers)):
        decorated = f"Обращение пациента:\n{text}\n\n{cats_block}"
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": decorated},
        ]

        try:
            raw, elapsed = call_llm(url, args.model, messages)
            latencies.append(elapsed)
        except Exception as e:
            logger.warning("Example %d failed: %s", i + 1, e)
            failed_count += 1
            continue

        try:
            actual = json.loads(raw)
            valid_json_count += 1
        except json.JSONDecodeError:
            logger.warning("Example %d: invalid JSON: %s", i + 1, raw[:100])
            invalid_json_count += 1
            continue

        # is_important
        pred_imp = actual.get("is_important", False)
        all_preds_imp.append(1 if pred_imp else 0)
        all_true_imp.append(label)

        # category / subcategory (only for important)
        if expected["is_important"]:
            exp_cat = (expected.get("category") or {}).get("id")
            act_cat = (actual.get("category") or {}).get("id")
            if exp_cat:
                cat_total += 1
                if exp_cat == act_cat:
                    cat_correct += 1

            exp_sub = (expected.get("subcategory") or {}).get("id")
            act_sub = (actual.get("subcategory") or {}).get("id")
            if exp_sub:
                sub_total += 1
                if exp_sub == act_sub:
                    sub_correct += 1

            # ROUGE formalized_text
            ref_form = expected.get("formalized_text", "")
            pred_form = actual.get("formalized_text", "")
            if ref_form and pred_form:
                sc = scorer.score(ref_form, pred_form)
                form_r1.append(sc["rouge1"].fmeasure)
                form_r2.append(sc["rouge2"].fmeasure)
                form_rl.append(sc["rougeL"].fmeasure)

            # ROUGE theses
            ref_theses = expected.get("theses", [])
            pred_theses = actual.get("theses", [])
            if ref_theses and pred_theses:
                ref_str = "\n".join(f"- {t}" for t in ref_theses)
                pred_str = "\n".join(f"- {t}" for t in pred_theses)
                sc = scorer.score(ref_str, pred_str)
                thes_r1.append(sc["rouge1"].fmeasure)
                thes_r2.append(sc["rouge2"].fmeasure)
                thes_rl.append(sc["rougeL"].fmeasure)

        if (i + 1) % 5 == 0:
            logger.info("  LLM: %d/%d done (avg %.1fs/req)",
                        i + 1, len(test_texts),
                        sum(latencies) / len(latencies) if latencies else 0)

    # ── Results ──────────────────────────────────────────────────────────
    def avg(lst):
        return sum(lst) / len(lst) if lst else 0.0

    f1m = f1_score(all_true_imp, all_preds_imp, average="macro") if all_true_imp else 0.0
    f1b = f1_score(all_true_imp, all_preds_imp, average="binary") if all_true_imp else 0.0
    imp_acc = sum(1 for a, b in zip(all_true_imp, all_preds_imp) if a == b) / len(all_true_imp) if all_true_imp else 0.0

    # Docker memory
    docker_mem = get_container_memory()
    model_size = get_model_size()

    print(f"\n{'='*65}")
    print(f"  LLM BENCHMARK (Qwen2.5-3B, zero-shot, {args.model})")
    print(f"{'='*65}")

    print(f"\n--- 1. QUALITY METRICS ---")
    print(f"  Tested:              {len(latencies)} examples")
    print(f"  Failed requests:     {failed_count}")
    print(f"  Valid JSON:          {valid_json_count}/{valid_json_count + invalid_json_count}"
          f" ({valid_json_count/(valid_json_count+invalid_json_count)*100:.0f}%)" if (valid_json_count + invalid_json_count) > 0 else "")
    print(f"  Classification:")
    print(f"    is_important acc:  {imp_acc:.4f}")
    print(f"    is_important F1-m: {f1m:.4f}")
    print(f"    is_important F1-b: {f1b:.4f}")
    if cat_total:
        print(f"    category acc:      {cat_correct/cat_total:.4f} ({cat_correct}/{cat_total})")
    if sub_total:
        print(f"    subcategory acc:   {sub_correct/sub_total:.4f} ({sub_correct}/{sub_total})")
    print(f"  Formalization ({len(form_rl)} important examples):")
    print(f"    ROUGE-1: {avg(form_r1):.4f}  ROUGE-2: {avg(form_r2):.4f}  ROUGE-L: {avg(form_rl):.4f}")
    print(f"  Theses ({len(thes_rl)} important examples):")
    print(f"    ROUGE-1: {avg(thes_r1):.4f}  ROUGE-2: {avg(thes_r2):.4f}  ROUGE-L: {avg(thes_rl):.4f}")

    print(f"\n--- 2. LATENCY ---")
    if latencies:
        sorted_lat = sorted(latencies)
        print(f"    Avg:   {avg(latencies)*1000:.0f} ms")
        print(f"    p50:   {sorted_lat[len(sorted_lat)//2]*1000:.0f} ms")
        print(f"    p95:   {sorted_lat[int(len(sorted_lat)*0.95)]*1000:.0f} ms")
        print(f"    Min:   {min(latencies)*1000:.0f} ms")
        print(f"    Max:   {max(latencies)*1000:.0f} ms")
        print(f"    Total: {sum(latencies):.0f} s")

    print(f"\n--- 3. MEMORY ---")
    print(f"    Model size:       {model_size}")
    print(f"    Docker container: {docker_mem}")


if __name__ == "__main__":
    main()
