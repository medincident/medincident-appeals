#!/usr/bin/env python3
"""Smoke-test: загружает все три модели и прогоняет N примеров"""

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
    width = 65
    print("\n" + "=" * width)
    print(f"  текст: {text}")
    print("=" * width)

    is_imp, conf = clf.predict(text)
    print(f"  is_important : {is_imp}")
    print(f"  confidence   : {conf:.4f}")

    if not is_imp:
        print("  (обращение неважное — seq2seq и категория не запускаются)")
        print("=" * width)
        return

    formalized = proc.formalize(text)
    theses = proc.extract_theses(text)
    category, subcategory = matcher.match(text, formalized)

    print(f"  formalized   : {formalized}")
    for i, t in enumerate(theses, 1):
        label = "  theses      :" if i == 1 else "               "
        print(f"{label} {t}")
    print(f"  category     : {category['name'] if category else '—'}")
    print(f"  subcategory  : {subcategory['name'] if subcategory else '—'}")
    print("=" * width)


def pick_random(n: int) -> list[str]:
    lines = DATASET_PATH.read_text(encoding="utf-8").splitlines()
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
