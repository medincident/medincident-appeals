# ai_medincident — Контекст проекта

## Назначение

Дипломная работа. ИИ-система для обработки обращений пациентов в больнице. Пациент пишет свободный текст — система классифицирует и структурирует жалобу в формализованный медицинский инцидент.

**Суть диплома** — сравнение двух подходов: LLM (Qwen2.5-3B zero-shot) vs NLP-pipeline (3 fine-tuned модели).

---

## Файлы документации

| Файл | Что внутри | Когда читать |
|------|-----------|--------------|
| `theory.md` | **Вся теория** — BERT, T5, embeddings, beam search, loss, метрики, аугментация, data leakage, бенчмаркинг | Чтобы понять КАК и ПОЧЕМУ работает каждая модель |
| `report.md` | **Результаты для диплома** — статистика датасета, baseline метрики, бенчмарки, сравнительные таблицы. Дополняется по мере работы | Чтобы посмотреть текущие числа и результаты |
| `frontend/plan.md` | Полный анализ проекта — модели, баги, рекомендации | Справочник по архитектуре |
| `frontend/CONTEXT.md` | Краткий контекст для нового чата | Быстрый онбординг |
| `frontend/questions.md` | Вопросы руководителю диплома | Методологические вопросы |

---

## Два подхода

### Подход 1 — LLM (Qwen2.5-3B через Ollama)
- Один вызов → полный JSON. Zero-shot.
- CPU: ~104s/запрос. GPU: ~3-5s. RAM: ~4 GB.
- Подробности: `llm-service/CLAUDE.md`

### Подход 2 — NLP-pipeline (3 специализированные модели)
- `rubert-tiny2` (29 MB) → is_important (бинарная классификация)
- `rut5-base-multitask` (222 MB) → formalized_text + theses (seq2seq)
- `MiniLM-L12-v2` (117 MB) → category + subcategory (zero-shot cosine similarity)
- CPU: p50=7ms, p95=4.3s. RAM: ~1.6 GB.
- Подробности: `nlp-service/CLAUDE.md`

---

## Структура проекта

```
ai_medincident/
├── dataset.jsonl              # 3000 примеров (75/25 баланс, template_id)
├── generate_dataset.py        # генератор датасета (seed=42)
├── test_llm.py                # тест Qwen на 1 примере
├── benchmark_llm.py           # бенчмарк Qwen на test set
├── theory.md                  # вся теория
├── report.md                  # результаты для диплома
├── categories-service/        # публикация категорий в NATS KV
├── llm-service/               # Ollama + Qwen2.5-3B
├── nlp-service/               # NLP-пайплайн
│   ├── models/                # classifier, seq2seq, similarity
│   ├── train_classifier.py    # fine-tune rubert-tiny2
│   ├── train_seq2seq.py       # fine-tune rut5 (ROUGE + BERTScore метрики)
│   ├── benchmark_nlp.py       # бенчмарк NLP pipeline (quality + latency + memory)
│   └── trained_models/        # fine-tuned веса (после обучения)
├── backend/                   # Python backend, оркестрирует пайплайн
├── frontend/                  # Next.js 16 + NextAuth + Zitadel
└── docker-compose.yml
```

---

## Датасет

`dataset.jsonl` — 3000 синтетических примеров. Генерация: `python3 generate_dataset.py`

- 199 шаблонов (164 важных + 35 неважных), ~15 вариаций на шаблон
- Баланс: 75% important / 25% not-important
- Аугментация: синонимы, опечатки, разговорные вставки, стилевые обёртки
- `template_id` в каждой строке — для split без data leakage
- Train/val/test split по шаблонам: 70/15/15

---

## Категории

Хранятся в `categories-service/categories.py`. 7 категорий, 22 подкатегории. Публикуются в NATS KV при старте.

**Реальные категории с сервера** (отличаются от текущих в `categories.py`, обновление TODO):
1. Организация работы регистратуры КДО (3 подкатегории)
2. Профилактика рисков переливания крови (1 подкатегория)
3. Организация ухода за пациентами (5 подкатегорий)

---

## Быстрые команды

```bash
# Запустить всё
docker compose up --build

# Генерация датасета
python3 generate_dataset.py

# Обучение (cd nlp-service)
python3 train_classifier.py    # ~20 мин CPU
python3 train_seq2seq.py       # ~60 мин CPU

# Бенчмарки (cd nlp-service)
python3 benchmark_nlp.py       # полный pipeline (quality + latency + memory)

# LLM тест
python3 test_llm.py --seed 42  # один пример
python3 benchmark_llm.py --limit 30 # бенчмарк (~55 мин CPU)
```

---

## Что сделано

- [x] Архитектура с двумя подходами (LLM + NLP)
- [x] Датасет 3000 примеров (199 шаблонов, аугментация, template_id)
- [x] Split по шаблонам (без data leakage) в training скриптах
- [x] ROUGE/BERTScore метрики в train_seq2seq.py
- [x] Baseline оценка нетренированных моделей
- [x] Benchmark runner NLP (quality + latency + memory)
- [x] benchmark_llm.py (скрипт готов и проверен на 1 примере, нужен полный прогон)
- [x] theory.md — полная теоретическая база
- [x] report.md — результаты для диплома

## Что нужно сделать

1. **Обновить categories.py** под реальные категории с сервера (нужен полный список)
2. **Обучить модели** — `train_classifier.py` + `train_seq2seq.py` (датасет и скрипты готовы)
3. **Прогнать benchmark_llm.py** — `python3 benchmark_llm.py --limit 30` (~55 мин CPU / ~3 мин GPU)
4. **Заполнить сравнительную таблицу** в report.md (после п.2 и п.3)
