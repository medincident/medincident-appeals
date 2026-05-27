#!/usr/bin/env python3
"""
  uv run python -m models.classifier.run -m "упал с кровати"
  uv run python -m models.classifier.run -i
  echo "первый текст" | uv run python -m models.classifier.run
"""

import argparse
import sys


def print_result(classifier, text: str) -> None:
    text = text.strip()
    if not text:
        return
    is_important, confidence = classifier.predict(text)
    verdict = "important" if is_important else "not_important"
    print("─" * 70)
    print(f"INPUT:      {text}")
    print(f"VERDICT:    {verdict}  (confidence={confidence:.3f})")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run classifier (importance) on input text")
    parser.add_argument("-m", "--message", type=str, default=None)
    parser.add_argument("-i", "--interactive", action="store_true")
    args = parser.parse_args()

    from models.classifier.model import ImportanceClassifier

    print("Loading classifier...", flush=True)
    classifier = ImportanceClassifier()
    classifier.load()
    print(f"Ready ({'fine-tuned' if classifier.is_finetuned else 'base'})\n", flush=True)

    if args.interactive:
        print("Введите текст (Ctrl+D / Ctrl+Z для выхода):", flush=True)
        for line in sys.stdin:
            print_result(classifier, line)
        return

    if args.message:
        print_result(classifier, args.message)
        return

    if not sys.stdin.isatty():
        for line in sys.stdin:
            print_result(classifier, line)
        return

    parser.error("Передайте -m / -i или направьте текст в stdin")


if __name__ == "__main__":
    main()
