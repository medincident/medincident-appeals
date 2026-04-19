# nlp-service

NLP-пайплайн для обработки обращений пациентов без LLM. **Подход 2** из двух реализаций диплома (Подход 1 — `llm-service` на Qwen2.5-3B).

Три специализированные модели вместо одной большой:

| Этап | Модель | Задача | Размер |
|------|--------|--------|--------|
| 1 | `cointegrated/rubert-tiny2` | `is_important` (binary) | 29 MB |
| 2 | `cointegrated/rut5-base-multitask` | `formalized_text` + `theses` | 222 MB |
| 3 | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | `category` + `subcategory` (zero-shot) | 117 MB |

CPU: ~1 сек/запрос (p50 ~7 мс, p95 ~4.3 сек). RAM: ~1.6 GB. Без GPU.

---

## Быстрый старт

```bash
cd nlp-service
uv sync --extra dev --extra train   # все зависимости для разработки
python3 scripts/load_models.py      # скачать базовые модели (~368 MB)
uvicorn main:app --host 0.0.0.0 --port 8000
```

Проверка:
```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "упал с кровати ночью, никто не пришёл на помощь"}'
```

## Эндпоинты

| Метод | Путь | Что делает |
|-------|------|------------|
| POST | `/analyze` | полный пайплайн: text → JSON инцидент |
| GET | `/health` | статус моделей (loaded, finetuned) |
| GET | `/categories` | текущие категории из NATS-кэша |
| GET | `/metrics` | Prometheus-метрики (HTTP + кастомные пайплайна) |
| GET | `/docs` | OpenAPI (Swagger UI) |

## Обучение моделей

```bash
# Классификатор важности (CPU: ~20 мин, GPU: ~3 мин)
python3 -m models.classifier.train

# Seq2seq: формализация + тезисы (CPU: ~2 ч, GPU: ~15 мин)
python3 -m models.seq2seq.train
```

Скрипты делают split по `template_id` с `seed=42` — без data leakage, воспроизводимо.

Результаты сохраняются в `trained_models/{classifier,seq2seq}/`. Сервис автоматически подхватит fine-tuned веса при следующем запуске.

## Тесты

```bash
uv run pytest                       # все тесты (~5 сек)
uv run pytest tests/unit            # только unit
uv run pytest tests/integration     # только API-интеграционные
```

Покрытие:
- **unit**: `split_by_templates` (без data leakage), `build_reason`, `load_examples`
- **integration**: `/analyze` (important / not important / override / 422), `/health`, `/categories`, `/metrics`

## Линтер + форматтер

```bash
uv run ruff check --fix .           # линт + автофиксы
uv run ruff format .                # форматирование
```

Конфиг — в `pyproject.toml`, секция `[tool.ruff]`.

## Бенчмарки

Каждая модель — отдельный бенчмарк, плюс раннер `benchmark.py` для всех сразу.

```bash
# все три
python3 benchmarks/benchmark.py
python3 benchmarks/benchmark.py --limit 50

# только одна модель
python3 benchmarks/classifier_bench.py     # accuracy, F1, precision, recall
python3 benchmarks/seq2seq_bench.py        # ROUGE для formalize + theses
python3 benchmarks/similarity_bench.py     # top-1 category/subcategory accuracy

# подмножество
python3 benchmarks/benchmark.py --only classifier seq2seq
```

Результаты сохраняются в `benchmarks/results/<model>_{trained,untrained}.txt`.

## Структура

```
nlp-service/
├── main.py                         # FastAPI: роуты + lifespan
├── paths.py                        # единые константы путей (SERVICE_DIR, CACHE_DIR, …)
├── service/
│   ├── pipeline.py                 # оркестрация 3 моделей
│   ├── nats_client.py              # connect + watch categories
│   ├── logging_setup.py            # JSON-логирование
│   └── metrics.py                  # Prometheus counters + histograms
├── models/
│   ├── __init__.py                 # реэкспорт + get_device()
│   ├── shared.py                   # loader + split_by_templates
│   ├── classifier/{model,train}.py # rubert-tiny2
│   ├── seq2seq/{model,train}.py    # rut5
│   └── similarity/model.py         # MiniLM (zero-shot, без train)
├── scripts/
│   ├── load_models.py              # качает все 3 базовые
│   ├── run_models.py               # smoke-test пайплайна
│   ├── compress_trained_models.py  # fp32 → fp16
│   └── export_service.py           # упаковать сервис в zip без весов
├── benchmarks/
│   ├── _common.py                  # shared: load_test_set, measure_*, write_result
│   ├── benchmark.py                # раннер всех per-model бенчмарков
│   ├── classifier_bench.py         # accuracy / F1 / precision / recall
│   ├── seq2seq_bench.py            # ROUGE-1/2/L
│   ├── similarity_bench.py         # top-1 category accuracy
│   └── results/
│       ├── classifier_{trained,untrained}.txt
│       ├── seq2seq_{trained,untrained}.txt
│       ├── similarity_untrained.txt
│       └── pipeline_{trained,untrained}.txt
├── tests/
│   ├── conftest.py                 # моки для FastAPI-клиента
│   ├── unit/                       # split_by_templates, build_reason
│   └── integration/                # /analyze, /health, /metrics
├── models_cache/                   # volume: HF кэш (~368 MB)
├── trained_models/                 # volume: fine-tuned веса
├── Dockerfile + .dockerignore
├── entrypoint.sh
└── pyproject.toml
```

## paths.py

Единая точка правды для путей. Вместо того, чтобы каждый файл вычислял `Path(__file__).parents[N]` (ломается при перемещении) — все импортируют константы:

```python
from paths import CACHE_DIR, TRAINED_DIR, DATASET_PATH, SERVICE_DIR, ROOT_DIR
```

Скрипты, которые запускаются напрямую (`python3 scripts/x.py`), используют самодостаточный bootstrap в начале файла, который находит `paths.py`, идя вверх от `__file__`. Благодаря этому **файл можно переносить между папками без правок** — путь к корню сервиса разрешится автоматически.

## Переменные окружения

| Переменная | Default | Что делает |
|------------|---------|------------|
| `NATS_URL` | `nats://nats:4222` | адрес NATS для получения категорий |
| `LOG_LEVEL` | `INFO` | уровень логирования |
| `LOG_FORMAT` | `json` | `json` для Docker / `plain` для локальной отладки |

## Observability

- **Структурированные логи** — одна JSON-строка на событие, идут в stdout. Удобно для Loki / Elasticsearch.
- **Prometheus** — `/metrics` отдаёт стандартные HTTP-метрики + кастомные:
  - `nlp_pipeline_requests_total{outcome="important|not_important|error"}`
  - `nlp_pipeline_duration_seconds` (histogram)
  - `nlp_classifier_predictions_total{label="important|not_important"}`

## Горизонтальное масштабирование

Сервис stateless:
- Категории — в NATS (разделяемое состояние между репликами)
- Веса моделей — в `trained_models/` volume (все реплики читают одно и то же)
- Внутри обработки — никакого локального состояния между запросами

Запуск N реплик:
```bash
docker compose up --scale nlp-service=3
```

`container_name` в `docker-compose.yml` намеренно не задан — это блокирует `--scale`.

## Разделение зависимостей

`pyproject.toml` разделён на три группы:

- `dependencies` — runtime, что нужно для `/analyze`. Docker-образ ставит только их.
- `[dev]` extras — pytest, ruff. Ставятся через `uv sync --extra dev`.
- `[train]` extras — datasets, accelerate, sklearn, rouge-score, bert-score. Только для обучения и eval. Ставятся через `uv sync --extra train`.

Runtime-образ получается тоньше на ~500 MB.

## Интеграция с NATS

- Бакет: `medincident`, ключ: `categories`
- При старте: 20 попыток × 3 сек = 60 сек окно ожидания
- Фоновый watcher: автоматически обновляет эмбеддинги при изменении категорий без перезапуска
