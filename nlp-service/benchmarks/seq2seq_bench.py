#!/usr/bin/env python3
"""
seq2seq_bench.py — бенчмарк TextProcessor (rut5-base-multitask).

Считает на test hold-out (только important-примеры):
  - Quality: ROUGE-1/2/L для formalize()
  - Latency: среднее + p50/p95 в мс на formalize()
  - Memory:  размер модели на диске + RSS процесса

Результат:
  benchmarks/results/seq2seq_{trained,untrained}.txt

Запуск:
  cd nlp-service
  python3 benchmarks/seq2seq_bench.py
  python3 benchmarks/seq2seq_bench.py --limit 30
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
from models.seq2seq import BASE_MODEL

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODEL_NAME = "seq2seq"


def _make_rouge_scorer():
    from rouge_score import rouge_scorer

    class _WhitespaceTokenizer:
        """rouge_score не поддерживает кириллицу — нужен tokenizer по пробелам."""

        def tokenize(self, text):
            return text.lower().split()

    return rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"],
        use_stemmer=False,
        tokenizer=_WhitespaceTokenizer(),
    )


def run(limit: int | None = None) -> str:
    from models import TextProcessor

    logger.info("Loading TextProcessor...")
    t_load_start = time.time()
    proc = TextProcessor()
    proc.load()
    t_load = time.time() - t_load_start

    scorer = _make_rouge_scorer()

    # Берём только important — для неважных нет formalized_text
    test = [item for item in load_test_set(limit=limit) if item.label == 1]
    logger.info("Test set (important only): %d examples", len(test))

    form_r1, form_r2, form_rl = [], [], []
    latencies: list[float] = []

    for i, item in enumerate(test):
        t0 = time.time()
        formalized = proc.formalize(item.text)
        latencies.append(time.time() - t0)

        ref_form = item.answer.get("formalized_text", "")
        if ref_form and formalized:
            sc = scorer.score(ref_form, formalized)
            form_r1.append(sc["rouge1"].fmeasure)
            form_r2.append(sc["rouge2"].fmeasure)
            form_rl.append(sc["rougeL"].fmeasure)

        if (i + 1) % 25 == 0:
            logger.info("  %d/%d done", i + 1, len(test))

    def avg(xs: list[float]) -> float:
        return sum(xs) / len(xs) if xs else 0.0

    disk_bytes = measure_model_disk_size(BASE_MODEL)
    mem = measure_process_memory()

    avg_ms = avg(latencies) * 1000
    p50_ms = percentile(latencies, 0.50) * 1000
    p95_ms = percentile(latencies, 0.95) * 1000

    status = "fine-tuned" if proc.is_finetuned else "base"
    lines = [
        "=" * 65,
        f"  SEQ2SEQ BENCHMARK ({status})",
        "=" * 65,
        "",
        "--- 1. QUALITY (ROUGE) ---",
        f"  Test examples: {len(test)}",
        "",
        f"  formalize() — scored on {len(form_rl)} examples:",
        f"    ROUGE-1: {avg(form_r1):.4f}  ROUGE-2: {avg(form_r2):.4f}  ROUGE-L: {avg(form_rl):.4f}",
        "",
        "--- 2. LATENCY (formalize per example) ---",
        f"  Model load: {t_load:.1f}s",
        f"  Avg:        {avg_ms:.0f} ms",
        f"  p50:        {p50_ms:.0f} ms",
        f"  p95:        {p95_ms:.0f} ms",
        "",
        "--- 3. MEMORY ---",
        f"  Model disk size: {disk_bytes / 1024 / 1024:.1f} MB",
        *(f"  {k}: {v:.0f} MB" for k, v in mem.items()),
        "",
    ]
    report = "\n".join(lines)
    print(report)

    out_path = write_result(MODEL_NAME, proc.is_finetuned, report)
    logger.info("Result saved: %s", out_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark TextProcessor (rut5)")
    parser.add_argument("--limit", type=int, default=None, help="Ограничить число test-примеров")
    args = parser.parse_args()
    run(limit=args.limit)


if __name__ == "__main__":
    main()
