"""FastAPI-сервис NLP-пайплайна. Эндпоинты: /analyze, /health, /categories, /metrics."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models import CategoryMatcher, ImportanceClassifier, TextProcessor
from service import (
    CategoryCache,
    build_source,
    classifier_predictions_total,
    connect_with_retry,
    instrument_app,
    pipeline_duration_seconds,
    pipeline_requests_total,
    run_pipeline,
    setup_logging,
    subscribe_analyze,
)

setup_logging()
logger = logging.getLogger(__name__)

NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")

classifier = ImportanceClassifier()
processor = TextProcessor()
matcher = CategoryMatcher()


def _apply_categories(raw: list[dict]) -> None:
    matcher.update_categories(raw)
    logger.info("Categories updated: %d categories", len(raw))


# Cache переиндексирует matcher на каждое обновление (warmup + watch).
cache = CategoryCache(on_change=_apply_categories)
source = build_source()

_nc = None
_analyze_sub = None
_watcher_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _nc, _analyze_sub, _watcher_task
    logger.info("Loading NLP models...")
    classifier.load()
    processor.load()
    matcher.load()
    logger.info("All models loaded")

    if not await source.warmup(cache):
        logger.warning("Categories not loaded yet — watcher will pick them up")
    _watcher_task = asyncio.create_task(source.watch(cache))

    try:
        _nc = await connect_with_retry(NATS_URL)
        _analyze_sub = await subscribe_analyze(
            _nc,
            classifier,
            processor,
            matcher,
            run_pipeline,
            pipeline_duration_seconds,
            pipeline_requests_total,
            classifier_predictions_total,
        )
    except Exception as exc:
        logger.error("NATS unavailable: %s — analyze subscription disabled", exc)

    yield

    if _analyze_sub:
        await _analyze_sub.unsubscribe()
    if _watcher_task:
        _watcher_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _watcher_task
    if _nc:
        await _nc.drain()
    await source.close()


app = FastAPI(title="NLP Service", version="0.1.0", lifespan=lifespan)
instrument_app(app)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Не отдаём traceback клиенту: входной текст обращения может оказаться в repr(exc)."""
    logger.error("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


class AnalyzeRequest(BaseModel):
    text: str
    categories: list[dict] | None = None


class AnalyzeResponse(BaseModel):
    is_important: bool
    formalized_text: str
    category: dict[str, str] | None
    subcategory: dict[str, str] | None


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if not request.text.strip():
        raise HTTPException(status_code=422, detail="text must not be empty")

    loop = asyncio.get_event_loop()
    with pipeline_duration_seconds.time():
        try:
            result = await loop.run_in_executor(
                None,
                run_pipeline,
                request.text,
                request.categories,
                classifier,
                processor,
                matcher,
            )
        except Exception:
            pipeline_requests_total.labels(outcome="error").inc()
            raise

    outcome = "important" if result["is_important"] else "not_important"
    pipeline_requests_total.labels(outcome=outcome).inc()
    classifier_predictions_total.labels(label=outcome).inc()
    return result


@app.get("/health")
async def health():
    nats_connected = _nc is not None and _nc.is_connected
    analyze_subscribed = _analyze_sub is not None
    models_loaded = (
        classifier.model is not None
        and processor.model is not None
        and matcher.model is not None
    )
    healthy = nats_connected and analyze_subscribed and models_loaded

    payload = {
        "status": "ok" if healthy else "degraded",
        "nats_connected": nats_connected,
        "analyze_subscribed": analyze_subscribed,
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
        "categories_cached": cache.size(),
    }
    return JSONResponse(payload, status_code=200 if healthy else 503)


@app.get("/categories")
async def get_categories():
    return {"categories": cache.snapshot()}
