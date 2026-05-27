#!/usr/bin/env python3
"""Скачивание базовых весов seq2seq в models_cache/.

  uv run python -m models.seq2seq.load
"""

from models.seq2seq import BASE_MODEL
from paths import CACHE_DIR


def load_base() -> None:
    import sentencepiece  # noqa: F401
    from transformers import AutoTokenizer, T5ForConditionalGeneration

    print(f"[{BASE_MODEL}]")
    print("  Tokenizer (SentencePiece)...", flush=True)
    AutoTokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR, use_fast=True)
    print("  Model...", flush=True)
    T5ForConditionalGeneration.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)
    print("  OK")


if __name__ == "__main__":
    CACHE_DIR.mkdir(exist_ok=True)
    load_base()
