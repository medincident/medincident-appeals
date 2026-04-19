"""Оркестрация пайплайна: classifier → (если important) seq2seq + similarity."""

from __future__ import annotations

from typing import Any

from models import CategoryMatcher, ImportanceClassifier, TextProcessor


def build_reason(
    is_important: bool,
    subcategory: dict | None,
    category: dict | None,
) -> str:
    if not is_important:
        return "Сообщение не содержит жалоб на здоровье или условия пребывания"
    if subcategory:
        return f"Содержит жалобу на {subcategory['name'].lower()}"
    if category:
        return f"Содержит жалобу по категории: {category['name'].lower()}"
    return "Содержит жалобу медицинского характера"


def run_pipeline(
    text: str,
    override_categories: list[dict] | None,
    classifier: ImportanceClassifier,
    processor: TextProcessor,
    matcher: CategoryMatcher,
) -> dict[str, Any]:
    is_important, _confidence = classifier.predict(text)

    if not is_important:
        return {
            "is_important": False,
            "reason": build_reason(False, None, None),
            "formalized_text": text,
            "theses": [],
            "category": None,
            "subcategory": None,
        }

    formalized = processor.formalize(text)
    theses = processor.extract_theses(text)

    if override_categories:
        matcher.update_categories(override_categories)

    category, subcategory = matcher.match(text, formalized)

    return {
        "is_important": True,
        "reason": build_reason(True, subcategory, category),
        "formalized_text": formalized,
        "theses": theses,
        "category": category,
        "subcategory": subcategory,
    }
