#!/usr/bin/env python3
"""Smoke-test: прогон через реальный pipeline (с confidence-gate)"""

import argparse
import json
import random

from paths import DATASET_PATH, ensure_categories_service_on_path

ensure_categories_service_on_path()

DEFAULT_TEXT = "упал с кровати ночью, никто не пришёл на помощь"


def load_models():
    from categories import CATEGORIES

    from models import CategoryMatcher, ImportanceClassifier, TextProcessor

    clf = ImportanceClassifier()
    clf.load()
    proc = TextProcessor()
    proc.load()
    matcher = CategoryMatcher()
    matcher.load()
    matcher.update_categories(CATEGORIES)
    return clf, proc, matcher


def run(text: str, clf, proc, matcher) -> None:
    from service.pipeline import run_pipeline

    width = 65
    print("\n" + "=" * width)
    print(f"  текст: {text}")
    print("=" * width)

    result = run_pipeline(text, None, clf, proc, matcher)

    print(f"  is_important : {result['is_important']}")
    print(f"  confidence   : {result['important_confidence']:.4f}")
    print(f"  reason       : {result['reason']}")

    if not result["is_important"]:
        print("=" * width)
        return

    # При срабатывании confidence-gate pipeline возвращает пустые поля.
    if not result["category"]:
        print("  (низкая уверенность — seq2seq и категория пропущены)")
        print("=" * width)
        return

    print(f"  formalized   : {result['formalized_text']}")
    print(f"  category     : {result['category']['name'] if result['category'] else '—'}")
    print(f"  subcategory  : {result['subcategory']['name'] if result['subcategory'] else '—'}")
    print("=" * width)


def pick_random(n: int) -> list[str]:
    # Первая строка — meta-запись, её отфильтровываем.
    lines = [
        line
        for line in DATASET_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip() and "messages" in line
    ]
    samples = random.sample(lines, min(n, len(lines)))
    texts = []
    for line in samples:
        ex = json.loads(line)
        texts.append(ex["messages"][0]["content"])
    return texts


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke test NLP-пайплайна")
    parser.add_argument("-m", "--message", type=str, default=None, help="Свой текст запроса")
    parser.add_argument(
        "-n",
        type=int,
        default=None,
        metavar="N",
        help="Количество случайных запросов из датасета (1+)",
    )
    args = parser.parse_args()

    print("Загрузка моделей...")
    clf, proc, matcher = load_models()

    if args.n is not None:
        if args.n < 1:
            parser.error("-n должен быть >= 1")
        texts = pick_random(args.n)
    elif args.message:
        texts = [args.message]
    else:
        texts = [DEFAULT_TEXT]

    for text in texts:
        run(text, clf, proc, matcher)


if __name__ == "__main__":
    main()
