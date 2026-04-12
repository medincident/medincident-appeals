#!/usr/bin/env python3
"""
load.py — скачивает и кэширует все три модели NLP-сервиса.

Запуск: python3 load.py

Модели сохраняются в ./models_cache/ и используются сервисом без интернета.
Достаточно запустить один раз (или после смены моделей).

Размеры:
  rubert-tiny2                              ~29  MB
  rut5-base-multitask                       ~222 MB
  paraphrase-multilingual-MiniLM-L12-v2    ~117 MB
  ──────────────────────────────────────────────────
  Итого                                     ~368 MB
"""

from pathlib import Path

CACHE_DIR = Path(__file__).parent / "models_cache"
CACHE_DIR.mkdir(exist_ok=True)


def load_classifier() -> None:
    """rubert-tiny2 — бинарный классификатор важности."""
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    model_id = "cointegrated/rubert-tiny2"
    print(f"  Токенизатор...", flush=True)
    AutoTokenizer.from_pretrained(model_id, cache_dir=CACHE_DIR)
    print(f"  Модель...", flush=True)
    AutoModelForSequenceClassification.from_pretrained(
        model_id, num_labels=2, cache_dir=CACHE_DIR, ignore_mismatched_sizes=True
    )


def load_seq2seq() -> None:
    """rut5-base-multitask — формализация и тезисы (SentencePiece tokenizer)."""
    import sentencepiece  # noqa: F401 — проверяем что установлен
    from transformers import T5ForConditionalGeneration, T5Tokenizer

    model_id = "cointegrated/rut5-base-multitask"
    print(f"  Токенизатор (T5Tokenizer + SentencePiece)...", flush=True)
    # Используем T5Tokenizer напрямую — обходим Auto*-логику, которая тянет tiktoken
    T5Tokenizer.from_pretrained(model_id, cache_dir=CACHE_DIR)
    print(f"  Модель...", flush=True)
    T5ForConditionalGeneration.from_pretrained(model_id, cache_dir=CACHE_DIR)


def load_similarity() -> None:
    """paraphrase-multilingual-MiniLM-L12-v2 — embedding similarity для категорий."""
    from sentence_transformers import SentenceTransformer

    model_id = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    print(f"  Модель...", flush=True)
    SentenceTransformer(model_id, cache_folder=str(CACHE_DIR))


MODELS = [
    ("cointegrated/rubert-tiny2",
     "Классификатор важности обращения (is_important)",
     load_classifier),
    ("cointegrated/rut5-base-multitask",
     "Формализация текста и извлечение тезисов",
     load_seq2seq),
    ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
     "Подбор категории через embedding similarity",
     load_similarity),
]


def main() -> None:
    print(f"Кэш: {CACHE_DIR.resolve()}\n")

    for model_id, description, loader in MODELS:
        print(f"[{model_id}]")
        print(f"  {description}")
        try:
            loader()
            print(f"  OK\n")
        except Exception as e:
            print(f"  ОШИБКА: {e}\n")
            raise

    print("Все модели загружены.")
    total_bytes = sum(f.stat().st_size for f in CACHE_DIR.rglob("*") if f.is_file())
    print(f"Размер кэша: {total_bytes / 1024**2:.0f} MB")


if __name__ == "__main__":
    main()
