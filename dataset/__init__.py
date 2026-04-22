"""Генератор синтетического датасета жалоб пациентов.

Архитектура:
    templates/       — шаблоны жалоб (important + not_important).
    schema.py        — Template / Example dataclasses, валидация.
    augmenters.py    — аугментации (synonyms, QWERTY-typos, style, colloquial, multi).
    splitter.py      — детерминированный split train/val/test по template_id.
    metrics.py       — distinct-n, TTR, self-BLEU для оценки разнообразия.
    generator.py     — оркестрация.
    __main__.py      — CLI.
"""

from .schema import DATASET_VERSION, Example, Template

__all__ = ["DATASET_VERSION", "Example", "Template"]
