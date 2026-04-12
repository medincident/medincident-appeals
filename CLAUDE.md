# ai_medincident — Контекст проекта

## Назначение

ИИ-система для обработки обращений пациентов в больнице. Пациент пишет свободный текст — система анализирует, классифицирует и структурирует жалобу в формализованный медицинский инцидент.

---

## Итоговый JSON (выход системы)

```json
{
  "is_important": true,
  "reason": "Содержит жалобу на падения пациентов в мо",
  "formalized_text": "Пациент упал с кровати в ночное время. Вызов персонала остался без ответа.",
  "theses": ["Падение с кровати ночью", "Персонал не откликнулся на вызов"],
  "category": {"id": "cat_1", "name": "Организация ухода за пациентами"},
  "subcategory": {"id": "sub_1_1", "name": "Падения пациентов в МО"}
}
```

---

## Два подхода к обработке (реализованы параллельно)

### Подход 1 — llm-service (Qwen2.5-3B через Ollama)
- Один вызов к LLM → полный JSON
- Категории передаются динамически в user message из NATS
- CPU: ~130s/запрос. GPU: ~3-5s
- Подробности: [llm-service/CLAUDE.md](llm-service/CLAUDE.md)

### Подход 2 — nlp-service (NLP-пайплайн без LLM)
- Три специализированные модели: rubert-tiny2 + rut5 + MiniLM
- CPU: ~1s/запрос, ~370 MB суммарно
- CategoryMatcher работает zero-shot — автоматически подхватывает новые категории из NATS
- Подробности: [nlp-service/CLAUDE.md](nlp-service/CLAUDE.md)

---

## Сервисы (docker-compose)

| Сервис | Роль | Порт снаружи |
|--------|------|--------------|
| `nats` | Шина сообщений + KV-хранилище категорий | — (внутренний) |
| `categories-service` | Публикует категории в NATS KV при старте, затем завершается | — |
| `llm-service` | Ollama + Qwen2.5-3B | — (внутренний) |
| `nlp-service` | FastAPI: rubert + rut5 + MiniLM | — (внутренний) |
| `backend` | AI Backend — оркестрирует пайплайн | — (внутренний) |
| `frontend` | Веб-интерфейс для пациентов | **8082** → 3000 |

```
Пациент (браузер :8082)
    │
    ▼
frontend ──► backend ──► llm-service  (Подход 1)
                    └──► nlp-service  (Подход 2)
                    └──► nats KV (категории)
```

---

## Категории инцидентов

Хранятся в `categories-service/categories.py`. 7 категорий, 21 подкатегория.

| ID | Категория | Подкатегории |
|----|-----------|-------------|
| cat_1 | Организация ухода за пациентами | sub_1_1..1_4 |
| cat_2 | Лекарственная безопасность | sub_2_1..2_3 |
| cat_3 | Хирургическая безопасность | sub_3_1..3_3 |
| cat_4 | Диагностические ошибки | sub_4_1..4_3 |
| cat_5 | Инфекционная безопасность | sub_5_1..5_3 |
| cat_6 | Условия пребывания | sub_6_1..6_3 |
| cat_7 | Поведение и отношение персонала | sub_7_1..7_3 |

При старте `categories-service` публикует их в NATS JetStream KV:
- Бакет: `medincident`, ключ: `categories`
- Backend и nlp-service читают и следят за обновлениями через `kv.watchall()`

---

## Датасет

`dataset.jsonl` — 3000 примеров для fine-tune моделей.

**Формат:** только обращение + ответ (без системного промпта и категорий):
```json
{"messages": [
  {"role": "user", "content": "жалоба пациента"},
  {"role": "assistant", "content": "{...json...}"}
]}
```

Системный промпт и список категорий **добавляются динамически** при обучении и инференсе — это позволяет менять категории без регенерации датасета.

**Генерация:** `python3 generate_dataset.py`
- 90% важных (2700) / 10% неважных (300)
- Вариации: 15 преамбул × 15 суффиксов × опечатки
- `generate_dataset.py` — полная документация внутри файла

---

## Тестирование LLM

`test_llm.py` — тестирует Подход 1 (llm-service):
```bash
python3 test_llm.py                   # 1 важный пример
python3 test_llm.py --not-important   # 1 неважный пример
python3 test_llm.py --n 5             # 5 примеров + summary
python3 test_llm.py --seed 42         # воспроизводимый выбор
```
Автоматически определяет IP контейнера через `docker inspect`, декорирует обращение категориями из NATS.

---

## NATS JetStream KV

- Образ: `nats:2.10-alpine`, флаг `-js` (JetStream включён)
- Мониторинг: `http://nats:8222/healthz` (внутри сети)
- Бакет `medincident` создаётся `categories-service` при первом запуске

---

## Порядок запуска

```bash
docker compose up --build
```

Порядок старта через `depends_on` + healthcheck:
1. `nats` стартует и проходит healthcheck
2. `categories-service` публикует категории → завершается
3. `llm-service`, `nlp-service`, `backend` стартуют параллельно
4. `frontend` стартует после `backend`

---

## Fine-tune NLP моделей

После генерации датасета:

```bash
cd nlp-service

# Скачать базовые модели
python3 load.py

# Обучить классификатор важности (~20 мин CPU / ~3 мин GPU)
python3 train_classifier.py

# Обучить seq2seq формализатор (~60 мин CPU / ~8 мин GPU)
python3 train_seq2seq.py
```

Fine-tuned веса сохраняются в `trained_models/` (Docker volume `nlp_trained`).
После обучения перезапустить nlp-service: `docker compose restart nlp-service`.

---

## Технологический стек

| Слой | Технология |
|------|-----------|
| Backend | Python 3.12 + nats-py |
| LLM Inference | Ollama + Qwen2.5-3B (GGUF Q4_K_M) |
| NLP классификатор | rubert-tiny2 (HuggingFace Transformers) |
| NLP seq2seq | rut5-base-multitask (HuggingFace) |
| NLP similarity | paraphrase-multilingual-MiniLM-L12-v2 |
| Шина/KV | NATS JetStream |
| API (nlp-service) | FastAPI + uvicorn |
| Контейнеризация | Docker Compose |
| Frontend | Next.js (порт 8082) |
