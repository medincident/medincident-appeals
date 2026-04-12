# nlp-service — NLP-пайплайн без LLM

## Что делает

Обрабатывает обращения пациентов через три специализированные модели и возвращает полный JSON-инцидент — без LLM, на CPU, за ~1 секунду.

Это **Подход 2** из двух реализаций в проекте (Подход 1 — llm-service с Qwen2.5-3B через Ollama).

---

## Архитектура пайплайна

```
complaint text
      │
      ▼
┌─────────────────────┐
│  ImportanceClassifier│  rubert-tiny2 (29MB)
│  is_important + conf │  ~50ms на CPU
└──────────┬──────────┘
           │ is_important=False → возвращаем ранний ответ
           │ is_important=True  ↓
    ┌──────┴──────┬─────────────┐
    ▼             ▼             ▼
formalize()  theses()    match(formalized)
    │             │             │
    ▼             ▼             ▼
┌──────────┐ ┌────────┐ ┌──────────────┐
│  ruT5    │ │  ruT5  │ │  MiniLM      │
│ (222MB)  │ │(shared)│ │  (117MB)     │
└──────────┘ └────────┘ └──────────────┘
    │             │             │
    └─────────────┴─────────────┘
                  │
                  ▼
          итоговый JSON
```

---

## Модели

| Модель | Задача | Размер | Обучение |
|--------|--------|--------|----------|
| `cointegrated/rubert-tiny2` | is_important (binary) | 29 MB | Fine-tune обязателен |
| `cointegrated/rut5-base-multitask` | formalized_text + theses | 222 MB | Fine-tune рекомендован |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | category + subcategory | 117 MB | Не нужно (zero-shot) |

**CategoryMatcher** работает без обучения — категории берёт из NATS KV и пересчитывает эмбеддинги на лету. Если категории изменятся в NATS — сервис подхватит автоматически без перезапуска.

---

## Структура файлов

```
nlp-service/
├── main.py               # FastAPI: /analyze, /health, /categories
├── load.py               # скачать все модели в ./models_cache/
├── train_classifier.py   # fine-tune rubert-tiny2 на dataset.jsonl
├── train_seq2seq.py      # fine-tune rut5 на dataset.jsonl
├── models/
│   ├── __init__.py
│   ├── classifier.py     # ImportanceClassifier
│   ├── seq2seq.py        # TextProcessor (formalize + theses)
│   └── similarity.py     # CategoryMatcher (embedding similarity)
├── models_cache/         # HuggingFace кэш (volume: nlp_models)
├── trained_models/       # fine-tuned веса (volume: nlp_trained)
│   ├── classifier/       # создаётся после train_classifier.py
│   └── seq2seq/          # создаётся после train_seq2seq.py
├── pyproject.toml
└── Dockerfile
```

---

## Быстрый старт

### Скачать модели
```bash
cd nlp-service
pip install -e .
python3 load.py
```

### Обучить классификатор важности (рекомендуется)
```bash
python3 train_classifier.py
# Аргументы: --epochs 3 --lr 2e-5 --batch 32 --max-len 256 --val-split 0.15
# CPU: ~20 мин | GPU: ~3 мин
# Датасет: ../dataset.jsonl (3000 примеров)
```

### Обучить seq2seq (формализация + тезисы)
```bash
python3 train_seq2seq.py
# Аргументы: --epochs 5 --lr 5e-5 --batch 16 --max-src 256 --max-tgt 128
# CPU: ~60 мин | GPU: ~8 мин
# Датасет: ../dataset.jsonl (~2700 важных примеров × 2 задачи = ~5400 пар)
```

### Запустить сервис локально
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Тест
```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "упал с кровати ночью, никто не пришёл на помощь"}'
```

---

## API

### POST /analyze
```json
// Request
{"text": "жалоба пациента", "categories": null}

// Response
{
  "is_important": true,
  "reason": "Содержит жалобу на падения пациентов в мо",
  "formalized_text": "Пациент упал с кровати в ночное время...",
  "theses": ["Падение с кровати ночью", "Отсутствие реакции персонала"],
  "category": {"id": "cat_1", "name": "Организация ухода за пациентами"},
  "subcategory": {"id": "sub_1_1", "name": "Падения пациентов в МО"}
}
```

`categories` — опциональный override. Если null — используются категории из NATS-кэша.

### GET /health
Возвращает статус каждой модели: загружена ли, fine-tuned ли, сколько категорий проиндексировано.

---

## Интеграция с NATS

- Бакет: `medincident`, ключ: `categories`
- При старте: читает категории (20 попыток × 3s = 60s окно)
- Фоновый watcher: автоматически обновляет эмбеддинги при изменении категорий
- Переменная окружения: `NATS_URL` (default: `nats://nats:4222`)

---

## Состояния моделей

Каждая модель при загрузке проверяет наличие fine-tuned версии:

- `trained_models/classifier/` существует → загружает fine-tuned
- Иначе → загружает базовую из HuggingFace с предупреждением

Это позволяет запускать сервис сразу после `load.py` без обучения (базовое качество), и улучшать качество постепенно через train_*.py.

---

## Сравнение с LLM-подходом (llm-service)

| | nlp-service | llm-service |
|--|-------------|-------------|
| Размер моделей | ~370 MB | ~1.9 GB |
| Время на запрос (CPU) | ~1s | ~130s |
| Требует GPU | Нет | Желательно |
| Качество без обучения | Среднее | Лучше |
| Качество с fine-tune | Сопоставимое | — |
| Новые категории | Автоматически (embedding) | Через промпт |
