# nlp-service

Прогоняет обращение пациента через три специализированные модели и отдаёт JSON-инцидент. CPU, ~1 сек на запрос, без LLM.

| Этап | Модель | Размер |
|------|--------|--------|
| `is_important` | DeepPavlov/rubert-base-cased-conversational | ~700 MB |
| `formalized_text` + `theses` | cointegrated/rut5-base-multitask | 222 MB |
| `category` + `subcategory` (zero-shot) | sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 | 117 MB |

## Интерфейсы

**NATS request/reply** — основной путь, по которому ходит backend:

- subject: `nlp.analyze`
- queue group: `nlp-workers` (даёт авто-балансировку между репликами)
- payload: `{"text": "...", "categories": null}` (categories — опциональный override)
- reply: тот же JSON, что у `POST /analyze`. На ошибке — пустое тело и заголовок `Nats-Error`.

**HTTP** — для прямых вызовов / отладки:

| Метод | Путь | |
|-------|------|---|
| POST | `/analyze` | полный пайплайн |
| GET | `/health` | состояние моделей |
| GET | `/categories` | категории из NATS-кэша |
| GET | `/metrics` | Prometheus |
| GET | `/docs` | Swagger UI |

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "упал с кровати ночью"}'
```

## Категории

Тянутся из NATS KV (bucket `medincident`, key `categories`) при старте, обновляются на лету через watcher. В dev-окружении их публикует `categories-service-mock`.

## Запуск

```bash
cd nlp-service
uv sync --extra dev --extra train
python3 scripts/load_models.py        # ~368 MB базовых весов
uvicorn main:app --host 0.0.0.0 --port 8000
```

Через docker:

```bash
docker compose --profile dev up --build nlp-service
docker compose --profile dev up --build --scale nlp-service=3   # горизонтальный скейл
```

`container_name` намеренно не задан, иначе `--scale` не работает.

## Обучение

```bash
python3 -m models.classifier.train     # CPU ~20 мин, GPU ~3 мин
python3 -m models.seq2seq.train        # CPU ~2 ч, GPU ~15 мин
```

Веса попадают в `trained_models/{classifier,seq2seq}/`. Сервис подхватит их автоматически при следующем запуске; иначе грузит базовые из HF и пишет warning.

Split в `models/shared.py` — по `template_id` с `seed=42`, без data leakage.

## Тесты и линт

```bash
uv run pytest                          # всё, ~5 сек
uv run pytest tests/unit
uv run pytest tests/integration

uv run ruff check --fix .
uv run ruff format .
```

## Бенчмарки

```bash
python3 benchmarks/benchmark.py                         # все три
python3 benchmarks/benchmark.py --only classifier
python3 benchmarks/classifier_bench.py                  # только classifier
```

Результаты — в `benchmarks/results/<model>_{trained,untrained}.txt`.

## Конфиг

| Env | Default | |
|-----|---------|---|
| `NATS_URL` | `nats://nats:4222` | |
| `LOG_LEVEL` | `INFO` | |
| `LOG_FORMAT` | `json` | для Loki/Elastic; `plain` — для локальной отладки |

## Структура

```
nlp-service/
├── main.py                     # FastAPI: роуты, lifespan, NATS-подписка
├── paths.py                    # константы путей
├── service/
│   ├── pipeline.py             # оркестрация трёх моделей
│   ├── analyze_handler.py      # NATS-обработчик nlp.analyze (queue group)
│   ├── nats_client.py          # connect + watch categories
│   ├── logging_setup.py
│   └── metrics.py
├── models/
│   ├── classifier/{model,train}.py
│   ├── seq2seq/{model,train}.py
│   └── similarity/model.py     # zero-shot, без train
├── scripts/                    # load_models, run_models, compress, export
├── benchmarks/                 # per-model + результаты
├── tests/{unit,integration}/
├── models_cache/               # volume: HF кэш
└── trained_models/             # volume: fine-tuned веса
```

`pyproject.toml` поделён на runtime / `[dev]` / `[train]`. В Docker-образ попадает только runtime — экономит ~500 MB.

## Скейлинг

Сервис stateless: категории — в NATS, веса — в shared volume, никакого локального состояния между запросами. Можно поднимать сколько угодно реплик в одной queue group `nlp-workers` — NATS сам распределит нагрузку.
