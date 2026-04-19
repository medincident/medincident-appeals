"""Три модели пайплайна + общий код для тренировки и выбора устройства.

`get_device`, `Example`, `load_examples`, `split_by_templates` определены ДО импорта
подмодулей: подмодули делают `from models import get_device`, Python резолвит это
через partial-state инициализации пакета.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import NamedTuple

logger = logging.getLogger(__name__)


def get_device(preferred: str | None = None) -> str:
    """preferred имеет приоритет; при `cuda` без CUDA падаем в `cpu`.
    Без preferred — CUDA → MPS → CPU."""
    import torch

    if preferred == "cuda" and not torch.cuda.is_available():
        return "cpu"
    if preferred:
        return preferred
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class Example(NamedTuple):
    text: str
    answer: dict
    template_id: str


def load_examples(path: Path) -> list[Example]:
    examples: list[Example] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            msgs = ex["messages"]
            text = msgs[0]["content"]
            answer = json.loads(msgs[1]["content"])
            tid = ex.get("template_id", f"unknown_{len(examples)}")
            examples.append(Example(text=text, answer=answer, template_id=tid))
    logger.info(
        "Loaded %d examples (templates=%d)",
        len(examples),
        len({e.template_id for e in examples}),
    )
    return examples


def split_by_templates(
    template_ids: list[str],
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[int], list[int], list[int]]:
    """Split по template_id (а не по индексам) — вариации одного шаблона не могут
    попасть в разные сплиты. Предотвращает data leakage при валидации/тесте."""
    import numpy as np

    tid_to_indices: dict[str, list[int]] = {}
    for i, tid in enumerate(template_ids):
        tid_to_indices.setdefault(tid, []).append(i)

    unique_tids = list(tid_to_indices.keys())
    rng = np.random.default_rng(seed)
    rng.shuffle(unique_tids)

    n = len(unique_tids)
    n_val = int(n * val_ratio)
    n_test = int(n * test_ratio)

    val_tids = set(unique_tids[:n_val])
    test_tids = set(unique_tids[n_val : n_val + n_test])

    train_idx: list[int] = []
    val_idx: list[int] = []
    test_idx: list[int] = []
    for tid, indices in tid_to_indices.items():
        if tid in val_tids:
            val_idx.extend(indices)
        elif tid in test_tids:
            test_idx.extend(indices)
        else:
            train_idx.extend(indices)

    return train_idx, val_idx, test_idx


from .classifier import ImportanceClassifier  # noqa: E402
from .seq2seq import TextProcessor  # noqa: E402
from .similarity import CategoryMatcher  # noqa: E402

__all__ = [
    "CategoryMatcher",
    "Example",
    "ImportanceClassifier",
    "TextProcessor",
    "get_device",
    "load_examples",
    "split_by_templates",
]
