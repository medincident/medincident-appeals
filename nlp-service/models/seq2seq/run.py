#!/usr/bin/env python3
"""Прогон TextProcessor (seq2seq, формализация).

  uv run python -m models.seq2seq.run -m "упал с кровати"
  uv run python -m models.seq2seq.run -i
  echo "первый текст" | uv run python -m models.seq2seq.run
"""

import argparse
import sys


def print_result(processor, text: str) -> None:
    text = text.strip()
    if not text:
        return
    formalized = processor.formalize(text)
    print("─" * 70)
    print(f"INPUT:      {text}")
    print(f"FORMALIZED: {formalized}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run seq2seq (formalization) on input text")
    parser.add_argument("-m", "--message", type=str, default=None)
    parser.add_argument("-i", "--interactive", action="store_true")
    args = parser.parse_args()

    from models.seq2seq.model import TextProcessor

    print("Loading seq2seq...", flush=True)
    processor = TextProcessor()
    processor.load()
    print(f"Ready ({'fine-tuned' if processor.is_finetuned else 'base'})\n", flush=True)

    if args.interactive:
        print("Введите текст (Ctrl+D / Ctrl+Z для выхода):", flush=True)
        for line in sys.stdin:
            print_result(processor, line)
        return

    if args.message:
        print_result(processor, args.message)
        return

    if not sys.stdin.isatty():
        for line in sys.stdin:
            print_result(processor, line)
        return

    parser.error("Передайте -m / -i или направьте текст в stdin")


if __name__ == "__main__":
    main()
