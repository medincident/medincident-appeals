#!/usr/bin/env python3
"""Прогон всех трёх моделей подряд на одном тексте (smoke-test пайплайна).

  uv run python scripts/run_models.py
  uv run python scripts/run_models.py -m "упал с кровати"
  uv run python scripts/run_models.py -n 3
"""

import argparse
import json
import random

from mock_categories import CATEGORIES
from paths import DATASET_PATH

DEFAULT_TEXT = "упал с кровати ночью, никто не пришёл на помощь"


def load_all():
    from models.classifier.model import ImportanceClassifier
    from models.seq2seq.model import TextProcessor
    from models.similarity.model import CategoryMatcher

    print("Loading classifier...", flush=True)
    classifier = ImportanceClassifier()
    classifier.load()

    print("Loading seq2seq...", flush=True)
    processor = TextProcessor()
    processor.load()

    print("Loading similarity...", flush=True)
    matcher = CategoryMatcher()
    matcher.load()
    matcher.update_categories(CATEGORIES)
    print()

    return classifier, processor, matcher


def run_pipeline(text: str, classifier, processor, matcher) -> None:
    from models.classifier.run import print_result as print_classifier
    from models.seq2seq.run import print_result as print_seq2seq
    from models.similarity.run import print_result as print_similarity

    print("=" * 70)
    print(f"TEXT: {text}")
    print("=" * 70)
    print_classifier(classifier, text)
    print_seq2seq(processor, text)
    print_similarity(matcher, text)


def random_dataset_texts(n: int) -> list[str]:
    lines = [
        line for line in DATASET_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip() and "messages" in line
    ]
    samples = random.sample(lines, min(n, len(lines)))
    return [json.loads(line)["messages"][0]["content"] for line in samples]


def main() -> None:
    parser = argparse.ArgumentParser(description="Run all three NLP models on input text")
    parser.add_argument("-m", "--message", type=str, default=None)
    parser.add_argument("-n", type=int, default=None, help="N случайных текстов из датасета")
    args = parser.parse_args()

    if args.n is not None and args.n < 1:
        parser.error("-n должен быть >= 1")

    classifier, processor, matcher = load_all()

    if args.n is not None:
        texts = random_dataset_texts(args.n)
    elif args.message:
        texts = [args.message]
    else:
        texts = [DEFAULT_TEXT]

    for text in texts:
        run_pipeline(text, classifier, processor, matcher)


if __name__ == "__main__":
    main()
