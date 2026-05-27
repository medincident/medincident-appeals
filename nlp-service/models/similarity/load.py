#!/usr/bin/env python3
"""Скачивание базовых весов similarity-модели (MiniLM) в models_cache/.

  uv run python -m models.similarity.load
"""

from models.similarity import BASE_MODEL
from paths import CACHE_DIR


def load_base() -> None:
    from sentence_transformers import SentenceTransformer

    print(f"[{BASE_MODEL}]")
    print("  Model...", flush=True)
    SentenceTransformer(BASE_MODEL, cache_folder=str(CACHE_DIR))
    print("  OK")


if __name__ == "__main__":
    CACHE_DIR.mkdir(exist_ok=True)
    load_base()
