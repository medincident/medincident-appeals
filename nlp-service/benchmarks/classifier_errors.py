#!/usr/bin/env python3
"""
classifier_errors.py — error analysis ImportanceClassifier'а на hold-out test.

Находит все:
  - FP (false positive)  — модель сказала important, а на самом деле not_important
  - FN (false negative)  — модель сказала not_important, а на самом деле important

Сортирует внутри каждой группы по confidence убыванию — самые "уверенные"
ошибки сверху (это наиболее критичные случаи, т.к. confidence-gate их не отсекает).

Вывод:
  stdout + benchmarks/results/classifier_errors.txt

Запуск:
  cd nlp-service
  python3 benchmarks/classifier_errors.py
  python3 benchmarks/classifier_errors.py --limit 100
"""

import argparse
import logging
from collections import Counter
from dataclasses import dataclass

from benchmarks import load_test_set
from paths import BENCHMARK_RESULTS_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class Error:
    kind: str  # "FP" или "FN"
    template_id: str
    text: str
    true_label: int
    pred_label: int
    confidence: float


def format_error(err: Error) -> str:
    text = err.text if len(err.text) <= 120 else err.text[:117] + "..."
    return (
        f"  [{err.template_id:>8}] conf={err.confidence:.3f}  "
        f"{err.kind}  true={err.true_label} pred={err.pred_label}\n"
        f"           {text!r}"
    )


def run(limit: int | None = None) -> None:
    from models import ImportanceClassifier

    logger.info("Loading ImportanceClassifier...")
    clf = ImportanceClassifier()
    clf.load()

    test = load_test_set(limit=limit)
    logger.info(
        "Test set: %d examples (imp=%d, not=%d)",
        len(test),
        sum(t.label for t in test),
        sum(1 for t in test if t.label == 0),
    )

    errors: list[Error] = []

    for i, item in enumerate(test):
        is_imp, conf = clf.predict(item.text)
        pred = 1 if is_imp else 0
        if pred != item.label:
            kind = "FP" if pred == 1 else "FN"
            errors.append(
                Error(
                    kind=kind,
                    template_id=item.template_id,
                    text=item.text,
                    true_label=item.label,
                    pred_label=pred,
                    confidence=conf,
                )
            )

        if (i + 1) % 100 == 0:
            logger.info("  %d/%d done", i + 1, len(test))

    fps = sorted([e for e in errors if e.kind == "FP"], key=lambda e: -e.confidence)
    fns = sorted([e for e in errors if e.kind == "FN"], key=lambda e: -e.confidence)

    # Агрегация по template_id — какие шаблоны модель чаще путает.
    fp_templates = Counter(e.template_id for e in fps)
    fn_templates = Counter(e.template_id for e in fns)

    status = "fine-tuned" if clf.is_finetuned else "base"
    lines = [
        "=" * 75,
        f"  CLASSIFIER ERROR ANALYSIS ({status})",
        "=" * 75,
        "",
        f"  Total test:     {len(test)}",
        f"  Correct:        {len(test) - len(errors)}",
        f"  Errors:         {len(errors)}  (FP={len(fps)}, FN={len(fns)})",
        "",
        "  FP = модель сказала important, а на самом деле not_important (ложная тревога)",
        "  FN = модель пропустила реальный important (хуже для медицины)",
        "",
        "─" * 75,
        f"  FALSE NEGATIVES — пропущенные important ({len(fns)} шт, по убыванию confidence)",
        "─" * 75,
    ]

    if fns:
        lines.extend(format_error(e) for e in fns)
    else:
        lines.append("  (нет)")

    lines.extend(
        [
            "",
            "─" * 75,
            f"  FALSE POSITIVES — ложные тревоги ({len(fps)} шт, по убыванию confidence)",
            "─" * 75,
        ]
    )

    if fps:
        lines.extend(format_error(e) for e in fps)
    else:
        lines.append("  (нет)")

    if fn_templates or fp_templates:
        lines.extend(["", "─" * 75, "  ТОП-ПРОБЛЕМНЫЕ ШАБЛОНЫ", "─" * 75])
        if fn_templates:
            lines.append("  Шаблоны с FN (модель путает important → not_important):")
            for tid, count in fn_templates.most_common(10):
                lines.append(f"    {tid:>8}  — {count} ошибок")
        if fp_templates:
            lines.append("  Шаблоны с FP (модель путает not_important → important):")
            for tid, count in fp_templates.most_common(10):
                lines.append(f"    {tid:>8}  — {count} ошибок")

    lines.append("")
    report = "\n".join(lines)
    print(report)

    BENCHMARK_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = BENCHMARK_RESULTS_DIR / "classifier_errors.txt"
    out.write_text(report, encoding="utf-8")
    logger.info("Saved: %s", out)


def main() -> None:
    parser = argparse.ArgumentParser(description="Error analysis ImportanceClassifier")
    parser.add_argument("--limit", type=int, default=None, help="Ограничить число test-примеров")
    args = parser.parse_args()
    run(limit=args.limit)


if __name__ == "__main__":
    main()
