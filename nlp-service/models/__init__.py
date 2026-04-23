from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from typing import NamedTuple

import orjson

logger = logging.getLogger(__name__)



def get_device(preferred: str | None = None) -> str:
    import torch

    if preferred == "cuda" and not torch.cuda.is_available():
        return "cpu"
    if preferred is not None:
        return preferred
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# Датасет загрузка

class Example(NamedTuple):
    text: str
    answer: dict
    template_id: str


def _parse_example(raw: bytes, fallback_id: str) -> Example | None:
    """None — для meta-записей и строк без поля `messages`."""
    record = orjson.loads(raw)
    if record.get("__meta__") or "messages" not in record:
        return None
    msgs = record["messages"]
    return Example(
        text=msgs[0]["content"],
        answer=orjson.loads(msgs[1]["content"]),
        template_id=record.get("template_id", fallback_id),
    )


def load_examples(path: Path) -> list[Example]:
    """Читает JSONL датасет. orjson быстрее stdlib в 2–10 раз."""
    examples: list[Example] = []
    for raw in path.read_bytes().splitlines():
        if not raw.strip():
            continue
        parsed = _parse_example(raw, fallback_id=f"unknown_{len(examples)}")
        if parsed is not None:
            examples.append(parsed)

    n_templates = len({e.template_id for e in examples})
    logger.info("Loaded %d examples (templates=%d)", len(examples), n_templates)
    return examples


# Разделение на train/val/test


def split_by_templates(
    template_ids: list[str],
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[int], list[int], list[int]]:
    import numpy as np

    tid_to_indices: dict[str, list[int]] = defaultdict(list)
    for i, tid in enumerate(template_ids):
        tid_to_indices[tid].append(i)

    unique_tids = list(tid_to_indices)
    np.random.default_rng(seed).shuffle(unique_tids)

    n = len(unique_tids)
    n_val = int(n * val_ratio)
    n_test = int(n * test_ratio)

    def indices_of(tids: list[str]) -> list[int]:
        return [i for tid in tids for i in tid_to_indices[tid]]

    val = indices_of(unique_tids[:n_val])
    test = indices_of(unique_tids[n_val : n_val + n_test])
    train = indices_of(unique_tids[n_val + n_test :])
    return train, val, test


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
