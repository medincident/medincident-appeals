#!/usr/bin/env python3
"""
load_models.py — скачивает и кэширует все три модели NLP-сервиса.

Запуск: python3 scripts/load_models.py

Размеры (Всего: ~1.04 GB):
  rubert-base-cased-conversational ~700 MB
  rut5-base-multitask               222 MB
  paraphrase-multilingual-MiniLM-L12-v2 117 MB
"""

from models.classifier import BASE_MODEL as CLASSIFIER_MODEL
from models.seq2seq import BASE_MODEL as SEQ2SEQ_MODEL
from models.similarity import BASE_MODEL as SIMILARITY_MODEL
from paths import CACHE_DIR

CACHE_DIR.mkdir(exist_ok=True)


def load_classifier(model_id: str) -> None:
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print("  Токенизатор...", flush=True)
    AutoTokenizer.from_pretrained(model_id, cache_dir=CACHE_DIR)
    print("  Модель...", flush=True)
    AutoModelForSequenceClassification.from_pretrained(
        model_id,
        num_labels=2,
        cache_dir=CACHE_DIR,
        ignore_mismatched_sizes=True,
    )


def load_seq2seq(model_id: str) -> None:
    import sentencepiece  # noqa: F401 — проверяем что установлен
    from transformers import T5ForConditionalGeneration, T5Tokenizer

    print("  Токенизатор (T5Tokenizer + SentencePiece)...", flush=True)
    T5Tokenizer.from_pretrained(model_id, cache_dir=CACHE_DIR)
    print("  Модель...", flush=True)
    T5ForConditionalGeneration.from_pretrained(model_id, cache_dir=CACHE_DIR)


def load_similarity(model_id: str) -> None:
    from sentence_transformers import SentenceTransformer

    print("  Модель...", flush=True)
    SentenceTransformer(model_id, cache_folder=str(CACHE_DIR))


MODELS = [
    (CLASSIFIER_MODEL, "Классификатор важности (is_important)", load_classifier),
    (SEQ2SEQ_MODEL, "Формализация + тезисы", load_seq2seq),
    (SIMILARITY_MODEL, "Category similarity", load_similarity),
]


def main() -> None:
    print(f"Кэш: {CACHE_DIR.resolve()}\n")

    for model_id, description, loader in MODELS:
        print(f"[{model_id}]")
        print(f"  {description}")
        try:
            loader(model_id)
            print("  OK\n")
        except Exception as e:
            print(f"  ОШИБКА: {e}\n")
            raise

    print("Все модели загружены.")
    total_bytes = sum(f.stat().st_size for f in CACHE_DIR.rglob("*") if f.is_file())
    print(f"Размер кэша: {total_bytes / 1024**2:.0f} MB")


if __name__ == "__main__":
    main()
