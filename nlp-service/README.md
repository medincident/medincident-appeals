NLP TRAINING PACKAGE
====================
Обучение NLP-pipeline для классификации обращений пациентов.
Модели скачиваются автоматически с HuggingFace при первом запуске.

СТРУКТУРА
---------
dataset.jsonl              - 3000 примеров для обучения
categories.py              - категории инцидентов
train_classifier.py        - fine-tune rubert-tiny2 (is_important)
train_seq2seq.py           - fine-tune rut5 (formalized_text + theses)
benchmark_nlp.py           - бенчмарк pipeline
models/
  classifier.py            - ImportanceClassifier
  seq2seq.py               - TextProcessor
  similarity.py            - CategoryMatcher
pyproject.toml             - зависимости

УСТАНОВКА
---------
Python 3.10+

pip install torch transformers scikit-learn rouge-score bert-score \
    sentence-transformers sentencepiece protobuf numpy

Или через pyproject.toml:
  pip install -e .

ОБУЧЕНИЕ
--------
# 1. Классификатор важности (rubert-tiny2, 29 MB)
#    CPU: ~20 мин | GPU: ~3 мин
python3 train_classifier.py
# trained_models/classifier/ будет создана автоматически

# 2. Seq2seq (rut5-base-multitask, 222 MB)
#    CPU: ~60 мин | GPU: ~8 мин
python3 train_seq2seq.py
# trained_models/seq2seq/ будет создана автоматически

АРГУМЕНТЫ
---------
train_classifier.py:
  --epochs 3      (default: 3)
  --lr 2e-5       (default: 2e-5)
  --batch 32      (default: 32)
  --max-len 256   (default: 256)

train_seq2seq.py:
  --epochs 5      (default: 5)
  --lr 5e-5       (default: 5e-5)
  --batch 16      (default: 16, уменьшить до 8 при нехватке RAM)
  --max-src 128   (default: 128)
  --max-tgt 64    (default: 64)

БЕНЧМАРК (после обучения)
--------------------------
python3 benchmark_nlp.py                # полный бенчмарк
python3 benchmark_nlp.py --skip-seq2seq # только classifier

ПЕРЕНОС ОБРАТНО НА СЕРВЕР
--------------------------
После обучения скопируйте:
  trained_models/classifier/  ->  /path/nlp-service/trained_models/classifier/
  trained_models/seq2seq/     ->  /path/nlp-service/trained_models/seq2seq/

ПРИМЕЧАНИЕ
----------
Модели скачиваются в ./models_cache/ (~370 MB суммарно):
  cointegrated/rubert-tiny2                           (~29 MB)
  cointegrated/rut5-base-multitask                    (~222 MB)
  sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2  (~117 MB)
