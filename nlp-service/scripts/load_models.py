#!/usr/bin/env python3
"""Скачивает базовые веса всех трёх моделей в models_cache/.

  uv run python scripts/load_models.py

Размеры (Всего: ~1.04 GB):
  rubert-base-cased-conversational ~700 MB
  rut5-base-multitask               222 MB
  paraphrase-multilingual-MiniLM-L12-v2 117 MB
"""

from models.classifier.load import load_base as load_classifier
from models.seq2seq.load import load_base as load_seq2seq
from models.similarity.load import load_base as load_similarity
from paths import CACHE_DIR

LOADERS = [
    ("classifier", load_classifier),
    ("seq2seq", load_seq2seq),
    ("similarity", load_similarity),
]


def main() -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    print(f"Cache: {CACHE_DIR.resolve()}\n")

    for name, loader in LOADERS:
        print(f"=== {name} ===")
        loader()
        print()

    total_bytes = sum(f.stat().st_size for f in CACHE_DIR.rglob("*") if f.is_file())
    print(f"Done. Cache size: {total_bytes / 1024**2:.0f} MB")


if __name__ == "__main__":
    main()
