"""Оркестрация пайплайна: classifier → (если important) seq2seq + similarity."""

from __future__ import annotations

from typing import Any

from models import CategoryMatcher, ImportanceClassifier, TextProcessor

# Ниже этого порога классификатор неуверен — считаем результат "требует ручной проверки".
# Ловит две ошибки одновременно:
#   - low-conf True  → seq2seq на OOD галлюцинирует, лучше не генерить
#   - low-conf False → риск пропуска важной жалобы (в медицине цена FN > FP)
# В обоих случаях помечаем как important и отправляем на ручной просмотр.
# 0.70 — компромисс: 0.85 слишком агрессивен, 0.50 пропускает мусор.
CONFIDENCE_THRESHOLD = 0.70


def build_reason(
    is_important: bool,
    subcategory: dict | None,
    category: dict | None,
    confident: bool = True,
) -> str:
    if not confident:
        return "Обращение требует ручной проверки: низкая уверенность классификатора"
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
    is_important, confidence = classifier.predict(text)

    # Двусторонний gate: любое неуверенное предсказание → ручная проверка.
    # Консервативно трактуем как important (false positive безопаснее false negative).
    if confidence < CONFIDENCE_THRESHOLD:
        return {
            "is_important": True,
            "important_confidence": confidence,
            "reason": build_reason(True, None, None, confident=False),
            "formalized_text": text,
            "category": None,
            "subcategory": None,
        }

    if not is_important:
        return {
            "is_important": False,
            "important_confidence": confidence,
            "reason": build_reason(False, None, None),
            "formalized_text": text,
            "category": None,
            "subcategory": None,
        }

    formalized = processor.formalize(text)

    if override_categories:
        matcher.update_categories(override_categories)

    category, subcategory = matcher.match(text, formalized)

    return {
        "is_important": True,
        "important_confidence": confidence,
        "reason": build_reason(True, subcategory, category),
        "formalized_text": formalized,
        "category": category,
        "subcategory": subcategory,
    }
