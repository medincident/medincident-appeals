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
│ ImportanceClassifier│  rubert-tiny2 (29MB)
│ is_important + conf │  ~50ms на CPU
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
├── main.py                         # FastAPI: роуты + lifespan
├── paths.py                        # единые константы путей + bootstrap-хелперы
├── service/
│   ├── __init__.py
│   ├── pipeline.py                 # оркестрация 3 моделей (run_pipeline)
│   ├── nats_client.py              # connect + watch categories
│   ├── logging_setup.py            # JSON-логирование
│   └── metrics.py                  # Prometheus-метрики
├── models/
│   ├── __init__.py                 # реэкспорт трёх классов + get_device()
│   ├── shared.py                   # общий код для train: loader + template split
│   ├── classifier/
│   │   ├── __init__.py
│   │   ├── model.py                # ImportanceClassifier
│   │   └── train.py                # fine-tune rubert-tiny2
│   ├── seq2seq/
│   │   ├── __init__.py
│   │   ├── model.py                # TextProcessor
│   │   └── train.py                # fine-tune rut5
│   └── similarity/
│       ├── __init__.py
│       └── model.py                # CategoryMatcher (zero-shot, без train)
├── scripts/
│   ├── load_models.py              # качает все 3 базовые модели
│   ├── run_models.py               # быстрый прогон пайплайна без pytest
│   ├── compress_trained_models.py  # fp32 → fp16 для trained_models/
│   └── export_service.py           # упаковка сервиса в zip без весов
├── benchmarks/
│   ├── _common.py                  # shared: load_test_set, measure_*, write_result
│   ├── benchmark.py                # раннер: запускает все 3 per-model bench
│   ├── classifier_bench.py         # accuracy / F1 / precision / recall
│   ├── seq2seq_bench.py            # ROUGE для formalize + theses
│   ├── similarity_bench.py         # top-1 category/subcategory accuracy
│   └── results/
│       ├── classifier_{trained,untrained}.txt
│       ├── seq2seq_{trained,untrained}.txt
│       ├── similarity_untrained.txt
│       └── pipeline_{trained,untrained}.txt
├── tests/
│   ├── conftest.py                 # моки для FastAPI-клиента
│   ├── unit/                       # split_by_templates, build_reason
│   └── integration/                # /analyze, /health, /metrics
├── models_cache/                   # volume: HF кэш базовых моделей
├── trained_models/                 # volume: fine-tuned веса
├── Dockerfile
├── .dockerignore                   # исключает train.py, shared.py, benchmarks/
├── entrypoint.sh
├── pyproject.toml                  # все deps в основных + dev extras (ruff) + ruff + pytest
└── README.md
```

---

## Принципы архитектуры

1. **`models/` — только код, `models_cache/` и `trained_models/` — только данные.** Volume-маунты не пересекаются с Python-пакетом.
2. **Каждая модель — самодостаточная папка** (`model.py` + `train.py`). Открыл папку → увидел всё про модель.
3. **Runtime-образ тонкий.** `.dockerignore` исключает `models/*/train.py`, `models/shared.py`, `benchmarks/` — они нужны только для обучения и оценки.
4. **Сервис stateless** — готов к горизонтальному масштабированию. `trained_models/` — shared volume, все реплики читают одно и то же.

---

## Быстрый старт

### Скачать модели
```bash
cd nlp-service
uv sync
python3 scripts/load_models.py
```

### Обучить классификатор важности (рекомендуется)
```bash
python3 models/classifier/train.py
# или как модуль:
python3 -m models.classifier.train
# Аргументы: --epochs 3 --lr 2e-5 --batch 32 --max-len 256 --val-ratio 0.15
# CPU: ~20 мин | GPU: ~3 мин
# Датасет: ../dataset.jsonl (3000 примеров)
```

### Обучить seq2seq (формализация + тезисы)
```bash
python3 models/seq2seq/train.py
# Аргументы: --epochs 10 --lr 5e-5 --batch 32 --max-src 128 --max-tgt 64
# CPU: ~2 ч | GPU: ~15 мин
```

### Запустить сервис локально
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Бенчмарки
```bash
python3 benchmarks/benchmark.py                 # все три модели
python3 benchmarks/benchmark.py --only classifier
python3 benchmarks/classifier_bench.py          # только классификатор
```
Результаты: `benchmarks/results/<model>_{trained,untrained}.txt`.

### Быстро проверить пайплайн
```bash
python3 scripts/run_models.py
python3 scripts/run_models.py -m "упал с кровати"
python3 scripts/run_models.py -n 3     # 3 случайных примера из датасета
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

### GET /categories
Текущие категории из NATS-кэша.

---

## Интеграция с NATS

- Бакет: `medincident`, ключ: `categories`
- При старте: читает категории (20 попыток × 3s = 60s окно)
- Фоновый watcher: автоматически обновляет эмбеддинги при изменении категорий
- Переменная окружения: `NATS_URL` (default: `nats://nats:4222`)

Вся NATS-логика живёт в `service/nats_client.py`.

---

## Состояния моделей

Каждая модель при загрузке проверяет наличие fine-tuned версии:

- `trained_models/classifier/` существует → загружает fine-tuned
- Иначе → загружает базовую из HuggingFace с предупреждением

Это позволяет запускать сервис сразу после `load_models.py` без обучения (базовое качество), и улучшать качество постепенно через `models/*/train.py`.

---

## Горизонтальное масштабирование

Сервис готов к запуску в нескольких репликах:

- **Stateless** — весь контекст либо в NATS (категории), либо в volume-монтах (веса).
- **Shared volumes** — `nlp_models` и `nlp_trained` монтируются одинаково в каждую реплику (все читают одни и те же веса).
- Чтобы поднять N реплик в docker-compose: убрать `container_name: ai-medincident-nlp` и добавить `deploy.replicas: N` (или `docker compose up --scale nlp-service=N`).

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
