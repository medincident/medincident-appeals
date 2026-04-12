# CONTEXT — ai_medincident (для нового чата)

## Что это за проект

ИИ-система для обработки обращений пациентов в больнице. Пациент пишет свободный текст —
система анализирует, классифицирует и структурирует жалобу в формализованный медицинский
инцидент. Дипломная работа.

**Итоговый JSON:**
```json
{
  "is_important": true,
  "reason": "Содержит жалобу на падения пациентов в МО",
  "formalized_text": "Пациент упал с кровати в ночное время...",
  "theses": ["Падение с кровати ночью", "Персонал не откликнулся"],
  "category": {"id": "cat_1", "name": "Организация ухода за пациентами"},
  "subcategory": {"id": "sub_1_1", "name": "Падения пациентов в МО"}
}
```

---

## Структура проекта

```
ai_medincident/
├── dataset.jsonl              # 3000 примеров жалоб пациентов
├── generate_dataset.py        # генератор датасета
├── test_llm.py                # тестирование Qwen через датасет
├── categories-service/        # микросервис публикации категорий в NATS KV
│   ├── categories.py          # 7 категорий, 21 подкатегория
│   └── main.py
├── llm-service/               # Ollama + Qwen2.5-3B (Подход 1)
├── nlp-service/               # NLP-пайплайн без LLM (Подход 2)
│   ├── main.py                # FastAPI: /analyze, /health, /categories
│   ├── load.py                # скачать модели (~368 MB суммарно)
│   ├── train_classifier.py    # fine-tune rubert-tiny2
│   ├── train_seq2seq.py       # fine-tune rut5
│   └── models/
│       ├── classifier.py      # ImportanceClassifier (rubert-tiny2, 29MB)
│       ├── seq2seq.py         # TextProcessor (rut5-base-multitask, 222MB)
│       └── similarity.py      # CategoryMatcher (MiniLM, 117MB, zero-shot)
├── ai-medincident-backend/    # Python backend, оркестрирует пайплайн
├── ai-medincident-frontend/   # Next.js 16 + NextAuth + Zitadel OAuth
│   ├── plan.md                # ПОЛНЫЙ АНАЛИЗ ПРОЕКТА (читать обязательно)
│   └── CONTEXT.md             # этот файл
└── docker-compose.yml         # 6 сервисов
```

---

## Два подхода (суть диплома — сравнение)

### Подход 1 — llm-service (Qwen2.5-3B через Ollama)
- Один вызов к LLM → полный JSON
- Категории передаются динамически в user message из NATS KV
- CPU: ~130s/запрос. GPU: ~3-5s
- Размер: ~1.9 GB (GGUF Q4_K_M)
- Тестируется через `python3 test_llm.py`

### Подход 2 — nlp-service (3 специализированные NLP-модели)
- **rubert-tiny2** (29 MB) → binary classification: important / not_important
- **rut5-base-multitask** (222 MB) → formalized_text + theses (через prefix)
- **MiniLM** (117 MB) → category + subcategory (zero-shot cosine similarity)
- CPU: ~1s/запрос, ~370 MB суммарно
- Fine-tune нужен для rubert и rut5, MiniLM работает без обучения

---

## Датасет — ключевые факты

| Параметр | Значение |
|----------|----------|
| Всего примеров | 3000 |
| Важных / Неважных | 2700 (90%) / 300 (10%) |
| Длина текста avg | 96 символов, max 134 |
| Уникальных шаблонов | 120 важных + 15 неважных |
| Категорий / подкатегорий | 7 / 21 |

**КРИТИЧЕСКИЕ ПРОБЛЕМЫ ДАТАСЕТА:**
1. **Data Leakage** — вариации одного шаблона (23 штуки) попадают и в train и в val.
   Split нужно делать по шаблонам, а не по примерам.
2. **Дисбаланс 90:10** — нужна балансировка или weighted loss.
3. **Только 120 уникальных жалоб** — высокий риск overfitting.
4. **Нет test set** — только train+val; нужен hold-out test 15%.
5. **Нет edge cases** — нет длинных текстов (>200 символов), нет мультикатегорийных жалоб.

---

## Баги в коде

| Файл | Проблема |
|------|----------|
| `nlp-service/models/classifier.py:80` | inference max_length=512, тренировка max_len=256 — рассогласование |
| `nlp-service/train_seq2seq.py:208-209` | default `--max-src 128 --max-tgt 64`, но CLAUDE.md пишет 256/128 |
| `nlp-service/train_seq2seq.py:171` | `predict_with_generate=False` — завышает метрику на val |

---

## Категории инцидентов (из categories-service/categories.py)

| ID | Категория | Подкатегории |
|----|-----------|-------------|
| cat_1 | Организация ухода за пациентами | sub_1_1..1_4 |
| cat_2 | Лекарственная безопасность | sub_2_1..2_3 |
| cat_3 | Хирургическая безопасность | sub_3_1..3_3 |
| cat_4 | Диагностические ошибки | sub_4_1..4_3 |
| cat_5 | Инфекционная безопасность | sub_5_1..5_3 |
| cat_6 | Условия пребывания | sub_6_1..6_3 |
| cat_7 | Поведение и отношение персонала | sub_7_1..7_3 |

---

## Технологический стек

| Компонент | Технология |
|-----------|-----------|
| LLM Inference | Ollama + Qwen2.5-3B (GGUF Q4_K_M) |
| NLP классификатор | cointegrated/rubert-tiny2 (HuggingFace Transformers) |
| NLP seq2seq | cointegrated/rut5-base-multitask |
| NLP similarity | paraphrase-multilingual-MiniLM-L12-v2 (sentence-transformers) |
| Шина/KV | NATS JetStream |
| API (nlp-service) | FastAPI + uvicorn |
| Backend | Python 3.12 + nats-py |
| Frontend | Next.js 16.2.1 + Bun + NextAuth + Zitadel OAuth |
| UI компоненты | shadcn/ui + Tailwind v4 + Radix UI |
| Контейнеризация | Docker Compose (6 сервисов) |

---

## Порядок запуска

```bash
docker compose up --build
# nats → categories-service → {llm, nlp, backend} → frontend
# Frontend: http://localhost:8082
```

**Команды тестирования:**
```bash
python3 test_llm.py                   # 1 пример через Qwen
python3 test_llm.py --n 10 --seed 42  # 10 примеров с summary

cd nlp-service
python3 load.py                # скачать модели
python3 train_classifier.py    # ~20 мин CPU
python3 train_seq2seq.py       # ~60 мин CPU
```

---

## Что сделано / что нужно сделать

### Сделано ✅
- Полная архитектура системы с двумя подходами
- Датасет 3000 примеров
- Все три NLP-модели (classifier, seq2seq, similarity)
- FastAPI сервис с NATS интеграцией
- Docker Compose оркестрация
- Frontend с NextAuth/Zitadel
- test_llm.py для бенчмарка Qwen

### Нужно сделать для диплома ⬜
1. Исправить data leakage — split по шаблонам
2. Создать hold-out test set (15%)
3. Запустить baselines (base модели без fine-tune)
4. Обучить rubert-tiny2 и rut5
5. Написать единый benchmark runner (NLP vs LLM)
6. Добавить ROUGE/BERTScore метрики в train_seq2seq.py
7. Замерить latency и memory для обоих подходов
8. Сравнительная таблица результатов

---

## Ключевые файлы для изучения

1. `plan.md` — полный анализ проекта с терминологией (ПРОЧИТАТЬ ПЕРВЫМ)
2. `dataset.jsonl` — первые 10 строк дают полную картину структуры
3. `categories-service/categories.py` — полный список категорий
4. `nlp-service/main.py` — весь NLP пайплайн (pipeline)
5. `nlp-service/train_classifier.py` — обучение классификатора
6. `nlp-service/train_seq2seq.py` — обучение seq2seq
7. `nlp-service/models/similarity.py` — CategoryMatcher (zero-shot)
8. `test_llm.py` — тестирование LLM, можно использовать как шаблон

---

## Метрики для итогового сравнения

### NLP-pipeline (после fine-tune)
- is_important F1-macro: target >0.90
- category accuracy: target >70%
- subcategory accuracy: target >55%
- ROUGE-L (formalized): target >0.55
- latency p50: ~1s CPU

### LLM (Qwen zero-shot)
- is_important F1-macro: ?
- category accuracy: ?
- subcategory accuracy: ?
- ROUGE-L (formalized): ?
- latency p50: ~130s CPU / ~4s GPU
