"""
nlp-service — FastAPI-сервис NLP-пайплайна без LLM.

Эндпоинты:
  POST /analyze          — обработать обращение → полный JSON
  GET  /health           — статус сервиса и состояние моделей
  GET  /categories       — текущие категории из NATS-кэша

Пайплайн на каждый запрос:
  1. ImportanceClassifier  → is_important
  2. (если важно) TextProcessor.formalize() → formalized_text
  3. (если важно) TextProcessor.extract_theses() → theses
  4. (если важно) CategoryMatcher.match()  → category + subcategory
  5. Шаблон reason из subcategory
  6. Собираем итоговый JSON

Интеграция с NATS:
  - При старте: читает категории из KV-бакета medincident / ключ categories
  - Запускает фоновый watcher: при изменении категорий в NATS автоматически
    пересчитывает эмбеддинги CategoryMatcher (без перезапуска сервиса)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from models import CategoryMatcher, ImportanceClassifier, TextProcessor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
KV_BUCKET = "medincident"
KV_KEY = "categories"

# ── глобальное состояние ──────────────────────────────────────────────────────

classifier = ImportanceClassifier()
processor = TextProcessor()
matcher = CategoryMatcher()
categories_cache: list[dict] = []


# ── NATS ──────────────────────────────────────────────────────────────────────

async def _connect_nats():
    import nats
    for attempt in range(1, 21):
        try:
            nc = await nats.connect(NATS_URL)
            logger.info("Connected to NATS: %s", NATS_URL)
            return nc
        except Exception as exc:
            logger.warning("NATS connect attempt %d/20 failed: %s", attempt, exc)
            await asyncio.sleep(3.0)
    raise RuntimeError("Cannot connect to NATS after 20 attempts")


def _apply_categories(raw: list[dict]) -> None:
    global categories_cache
    categories_cache = raw
    matcher.update_categories(raw)
    logger.info("Categories updated: %d categories", len(raw))


async def _load_categories(js) -> bool:
    try:
        kv = await js.key_value(KV_BUCKET)
        entry = await kv.get(KV_KEY)
        raw = json.loads(entry.value.decode("utf-8"))
        _apply_categories(raw)
        return True
    except Exception as exc:
        logger.warning("Cannot load categories from NATS KV: %s", exc)
        return False


async def _watch_categories(js) -> None:
    while True:
        try:
            kv = await js.key_value(KV_BUCKET)
            watcher = await kv.watchall()
            async for entry in watcher:
                if entry and entry.key == KV_KEY:
                    raw = json.loads(entry.value.decode("utf-8"))
                    _apply_categories(raw)
        except Exception as exc:
            logger.warning("KV watcher error: %s — restarting in 5s", exc)
            await asyncio.sleep(5.0)


# ── lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Загружаем модели
    logger.info("Loading NLP models...")
    classifier.load()
    processor.load()
    matcher.load()
    logger.info("All models loaded")

    # Подключаемся к NATS
    try:
        nc = await _connect_nats()
        js = nc.jetstream()

        # Первичная загрузка категорий (20 попыток × 3s = 60s окно)
        for attempt in range(20):
            if await _load_categories(js):
                break
            await asyncio.sleep(3.0)
        else:
            logger.error("Failed to load categories from NATS — matcher will return null")

        # Фоновый watcher
        watcher_task = asyncio.create_task(_watch_categories(js))
    except Exception as exc:
        logger.error("NATS unavailable: %s — service starts without categories", exc)
        nc = None
        watcher_task = None

    yield

    # Shutdown
    if watcher_task:
        watcher_task.cancel()
    if nc:
        await nc.drain()


app = FastAPI(title="NLP Service", version="0.1.0", lifespan=lifespan)


# ── схемы ─────────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    text: str
    categories: list[dict] | None = None  # если None — используем кэш из NATS


class AnalyzeResponse(BaseModel):
    is_important: bool
    reason: str
    formalized_text: str
    theses: list[str]
    category: dict[str, str] | None
    subcategory: dict[str, str] | None


# ── пайплайн ──────────────────────────────────────────────────────────────────

def _build_reason(is_important: bool, subcategory: dict | None, category: dict | None) -> str:
    if not is_important:
        return "Сообщение не содержит жалоб на здоровье или условия пребывания"
    if subcategory:
        return f"Содержит жалобу на {subcategory['name'].lower()}"
    if category:
        return f"Содержит жалобу по категории: {category['name'].lower()}"
    return "Содержит жалобу медицинского характера"


def _run_pipeline(text: str, override_categories: list[dict] | None) -> dict[str, Any]:
    # Шаг 1: важность
    is_important, confidence = classifier.predict(text)

    if not is_important:
        return {
            "is_important": False,
            "reason": _build_reason(False, None, None),
            "formalized_text": text,
            "theses": [],
            "category": None,
            "subcategory": None,
        }

    # Шаг 2 + 3: формализация и тезисы
    formalized = processor.formalize(text)
    theses = processor.extract_theses(text)

    # Шаг 4: категория через similarity
    if override_categories:
        matcher.update_categories(override_categories)

    category, subcategory = matcher.match(text, formalized)

    # Шаг 5: reason
    reason = _build_reason(True, subcategory, category)

    return {
        "is_important": True,
        "reason": reason,
        "formalized_text": formalized,
        "theses": theses,
        "category": category,
        "subcategory": subcategory,
    }


# ── эндпоинты ─────────────────────────────────────────────────────────────────

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if not request.text.strip():
        raise HTTPException(status_code=422, detail="text must not be empty")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, _run_pipeline, request.text, request.categories
    )
    return result


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models": {
            "classifier": {
                "loaded": classifier.model is not None,
                "finetuned": classifier.is_finetuned,
            },
            "seq2seq": {
                "loaded": processor.model is not None,
                "finetuned": processor.is_finetuned,
            },
            "similarity": {
                "loaded": matcher.model is not None,
                "categories_indexed": len(matcher._categories),
            },
        },
        "categories_cached": len(categories_cache),
    }


@app.get("/categories")
async def get_categories():
    return {"categories": categories_cache}
