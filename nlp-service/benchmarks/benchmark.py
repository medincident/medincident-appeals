#!/usr/bin/env python3
"""Раннер per-model бенчмарков. --only <name>... чтобы выбрать подмножество."""

import argparse
import logging

from benchmarks import classifier_bench, seq2seq_bench, similarity_bench

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BENCHES = {
    "classifier": classifier_bench.run,
    "seq2seq": seq2seq_bench.run,
    "similarity": similarity_bench.run,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Запустить все per-model бенчмарки")
    parser.add_argument(
        "--only",
        nargs="+",
        choices=list(BENCHES.keys()),
        default=list(BENCHES.keys()),
    )
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    for name in args.only:
        logger.info("=== Running %s benchmark ===", name)
        BENCHES[name](limit=args.limit)
        print()

    logger.info("Все бенчмарки завершены. Результаты в benchmarks/results/")


if __name__ == "__main__":
    main()
