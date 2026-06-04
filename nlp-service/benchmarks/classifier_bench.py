#!/usr/bin/env python3
"""
classifier_bench.py — бенчмарк ImportanceClassifier (rubert-base-cased-conversational).

Считает на test hold-out:
  - Quality: accuracy, F1 (macro + binary), precision, recall
  - Latency: среднее + p50/p95 в мс на предсказание
  - Memory:  размер модели на диске + RSS процесса

Результат:
  benchmarks/results/classifier_{trained,untrained}.txt

Запуск:
  cd nlp-service
  python3 benchmarks/classifier_bench.py
  python3 benchmarks/classifier_bench.py --limit 100
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
from models.classifier import BASE_MODEL

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_NAME = "classifier"


def run(limit: int | None = None) -> str:
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

    from models import ImportanceClassifier

    logger.info("Loading ImportanceClassifier...")
    t_load_start = time.time()
    clf = ImportanceClassifier()
    clf.load()
    t_load = time.time() - t_load_start

    test = load_test_set(limit=limit)
    logger.info(
        "Test set: %d examples (imp=%d, not=%d)",
        len(test),
        sum(t.label for t in test),
        sum(1 for t in test if t.label == 0),
    )

    preds: list[int] = []
    latencies: list[float] = []

    for i, item in enumerate(test):
        t0 = time.time()
        is_imp, _conf = clf.predict(item.text)
        latencies.append(time.time() - t0)
        preds.append(1 if is_imp else 0)

        if (i + 1) % 100 == 0:
            logger.info("  %d/%d done", i + 1, len(test))

    labels = [t.label for t in test]

    acc = accuracy_score(labels, preds)
    f1m = f1_score(labels, preds, average="macro")
    f1b = f1_score(labels, preds, average="binary")
    prec = precision_score(labels, preds, average="macro", zero_division=0)
    rec = recall_score(labels, preds, average="macro", zero_division=0)

    # Per-class метрики по important — именно здесь видна основная проблема:
    # низкий recall important = модель пропускает реальные жалобы/просьбы о помощи (FN).
    prec_imp = precision_score(labels, preds, pos_label=1, zero_division=0)
    rec_imp = recall_score(labels, preds, pos_label=1, zero_division=0)
    prec_ni = precision_score(labels, preds, pos_label=0, zero_division=0)
    rec_ni = recall_score(labels, preds, pos_label=0, zero_division=0)

    # Confusion matrix (важность = positive class). FN — пропущенные важные обращения.
    tp = sum(1 for y, p in zip(labels, preds, strict=False) if y == 1 and p == 1)
    fn = sum(1 for y, p in zip(labels, preds, strict=False) if y == 1 and p == 0)
    fp = sum(1 for y, p in zip(labels, preds, strict=False) if y == 0 and p == 1)
    tn = sum(1 for y, p in zip(labels, preds, strict=False) if y == 0 and p == 0)

    disk_bytes = measure_model_disk_size(BASE_MODEL)
    mem = measure_process_memory()

    avg_ms = sum(latencies) / len(latencies) * 1000
    p50_ms = percentile(latencies, 0.50) * 1000
    p95_ms = percentile(latencies, 0.95) * 1000

    status = "fine-tuned" if clf.is_finetuned else "base"
    lines = [
        "=" * 65,
        f"  CLASSIFIER BENCHMARK ({status})",
        "=" * 65,
        "",
        "--- 1. QUALITY ---",
        f"  Test examples:    {len(test)}  (imp={tp + fn}, not={tn + fp})",
        f"  Accuracy:         {acc:.4f}",
        f"  F1-macro:         {f1m:.4f}",
        f"  F1-binary (imp):  {f1b:.4f}",
        f"  Precision-macro:  {prec:.4f}",
        f"  Recall-macro:     {rec:.4f}",
        "",
        "  Per-class:",
        f"    important:      precision={prec_imp:.4f}  recall={rec_imp:.4f}",
        f"    not_important:  precision={prec_ni:.4f}  recall={rec_ni:.4f}",
        "",
        "  Confusion matrix (positive = important):",
        f"    TP={tp:<5} FN={fn:<5}  <- FN = пропущенные важные обращения",
        f"    FP={fp:<5} TN={tn:<5}",
        "",
        "--- 2. LATENCY (inference per example) ---",
        f"  Model load:       {t_load:.1f}s",
        f"  Avg:              {avg_ms:.2f} ms",
        f"  p50:              {p50_ms:.2f} ms",
        f"  p95:              {p95_ms:.2f} ms",
        "",
        "--- 3. MEMORY ---",
        f"  Model disk size:  {disk_bytes / 1024 / 1024:.1f} MB",
        *(f"  {k}: {v:.0f} MB" for k, v in mem.items()),
        "",
    ]
    report = "\n".join(lines)
    print(report)

    out_path = write_result(MODEL_NAME, clf.is_finetuned, report)
    logger.info("Result saved: %s", out_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark ImportanceClassifier")
    parser.add_argument("--limit", type=int, default=None, help="Ограничить число test-примеров")
    args = parser.parse_args()
    run(limit=args.limit)


if __name__ == "__main__":
    main()
