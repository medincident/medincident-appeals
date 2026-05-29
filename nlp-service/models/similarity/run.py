#!/usr/bin/env python3
"""Прогон CategoryMatcher (MiniLM, подбор категории и подкатегории).

Категории берутся из соседнего пакета categories-service.

  uv run python -m models.similarity.run -m "упал с кровати"
  uv run python -m models.similarity.run -i
  echo "первый текст" | uv run python -m models.similarity.run
"""

import argparse
import sys

from mock_categories import CATEGORIES


def print_result(matcher, text: str) -> None:
    text = text.strip()
    if not text:
        return
    category, subcategory = matcher.match(text)
    print("─" * 70)
    print(f"INPUT:       {text}")
    print(f"CATEGORY:    {category['name'] if category else '—'}")
    print(f"SUBCATEGORY: {subcategory['name'] if subcategory else '—'}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run similarity (category match) on input text")
    parser.add_argument("-m", "--message", type=str, default=None)
    parser.add_argument("-i", "--interactive", action="store_true")
    args = parser.parse_args()

    from models.similarity.model import CategoryMatcher

    print("Loading similarity...", flush=True)
    matcher = CategoryMatcher()
    matcher.load()
    matcher.update_categories(CATEGORIES)
    print(f"Ready (categories={len(CATEGORIES)})\n", flush=True)

    if args.interactive:
        print("Введите текст (Ctrl+D / Ctrl+Z для выхода):", flush=True)
        for line in sys.stdin:
            print_result(matcher, line)
        return

    if args.message:
        print_result(matcher, args.message)
        return

    if not sys.stdin.isatty():
        for line in sys.stdin:
            print_result(matcher, line)
        return

    parser.error("Передайте -m / -i или направьте текст в stdin")


if __name__ == "__main__":
    main()
