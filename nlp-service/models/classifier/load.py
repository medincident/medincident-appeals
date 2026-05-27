#!/usr/bin/env python3
"""Скачивание базовых весов классификатора в models_cache/.

  uv run python -m models.classifier.load
"""

from models.classifier import BASE_MODEL
from paths import CACHE_DIR


def load_base() -> None:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print(f"[{BASE_MODEL}]")
    print("  Tokenizer...", flush=True)
    AutoTokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)
    print("  Model...", flush=True)
    AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=2,
        cache_dir=CACHE_DIR,
        ignore_mismatched_sizes=True,
    )
    print("  OK")


if __name__ == "__main__":
    CACHE_DIR.mkdir(exist_ok=True)
    load_base()
