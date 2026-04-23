#!/usr/bin/env python3
"""
similarity_bench.py — бенчмарк CategoryMatcher (MiniLM-L12-v2).

Считает на test hold-out (только important-примеры):
  - Quality: accuracy top-1 для category и subcategory
  - Latency: среднее + p50/p95 в мс на match()
  - Memory:  размер модели на диске + RSS процесса

Категории берутся из categories-service/categories.py (локальный импорт,
не через NATS — это офлайн-бенчмарк).

Результат:
  benchmarks/results/similarity_{trained,untrained}.txt
  (для similarity finetuned=false всегда, т.к. zero-shot)

Запуск:
  cd nlp-service
  python3 benchmarks/similarity_bench.py
  python3 benchmarks/similarity_bench.py --limit 100
"""

import argparse
import logging
import time

from benchmarks import (
    load_test_set,
    measure_model_disk_size,
    measure_process_memory,
    percentile,
    write_result,
)
from models.similarity import BASE_MODEL
from paths import ensure_categories_service_on_path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_NAME = "similarity"


def run(limit: int | None = None) -> str:
    ensure_categories_service_on_path()
    from categories import CATEGORIES

    from models import CategoryMatcher

    logger.info("Loading CategoryMatcher...")
    t_load_start = time.time()
    matcher = CategoryMatcher()
    matcher.load()
    matcher.update_categories(CATEGORIES)
    t_load = time.time() - t_load_start

    test = [item for item in load_test_set(limit=limit) if item.label == 1]
    logger.info("Test set (important only): %d examples", len(test))

    cat_correct = 0
    cat_total = 0
    sub_correct = 0
    sub_total = 0
    latencies: list[float] = []

    for i, item in enumerate(test):
        formalized = item.answer.get("formalized_text") or None

        t0 = time.time()
        cat_result, sub_result = matcher.match(item.text, formalized)
        latencies.append(time.time() - t0)

        exp_cat = (item.answer.get("category") or {}).get("id")
        act_cat = (cat_result or {}).get("id")
        if exp_cat:
            cat_total += 1
            if exp_cat == act_cat:
                cat_correct += 1

        exp_sub = (item.answer.get("subcategory") or {}).get("id")
        act_sub = (sub_result or {}).get("id")
        if exp_sub:
            sub_total += 1
            if exp_sub == act_sub:
                sub_correct += 1

        if (i + 1) % 100 == 0:
            logger.info("  %d/%d done", i + 1, len(test))

    cat_acc = cat_correct / cat_total if cat_total else 0.0
    sub_acc = sub_correct / sub_total if sub_total else 0.0

    disk_bytes = measure_model_disk_size(BASE_MODEL)
    mem = measure_process_memory()

    avg_ms = sum(latencies) / len(latencies) * 1000 if latencies else 0.0
    p50_ms = percentile(latencies, 0.50) * 1000
    p95_ms = percentile(latencies, 0.95) * 1000

    lines = [
        "=" * 65,
        "  SIMILARITY BENCHMARK (zero-shot)",
        "=" * 65,
        "",
        "--- 1. QUALITY (top-1 accuracy) ---",
        f"  Test examples:     {len(test)}",
        f"  Category acc:      {cat_acc:.4f}  ({cat_correct}/{cat_total})",
        f"  Subcategory acc:   {sub_acc:.4f}  ({sub_correct}/{sub_total})",
        "",
        "--- 2. LATENCY (match() per example) ---",
        f"  Model load + index: {t_load:.1f}s",
        f"  Avg:                {avg_ms:.2f} ms",
        f"  p50:                {p50_ms:.2f} ms",
        f"  p95:                {p95_ms:.2f} ms",
        "",
        "--- 3. MEMORY ---",
        f"  Model disk size: {disk_bytes / 1024 / 1024:.1f} MB",
        *(f"  {k}: {v:.0f} MB" for k, v in mem.items()),
        "",
    ]
    report = "\n".join(lines)
    print(report)

    out_path = write_result(MODEL_NAME, finetuned=False, content=report)
    logger.info("Result saved: %s", out_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark CategoryMatcher (MiniLM)")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    run(limit=args.limit)


if __name__ == "__main__":
    main()
