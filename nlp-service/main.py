"""FastAPI-сервис NLP-пайплайна. Эндпоинты: /analyze, /health, /categories, /metrics."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models import CategoryMatcher, ImportanceClassifier, TextProcessor
from service import (
    classifier_predictions_total,
    connect_with_retry,
    instrument_app,
    load_categories_with_retry,
    pipeline_duration_seconds,
    pipeline_requests_total,
    poll_categories,
    run_pipeline,
    setup_logging,
    subscribe_analyze,
)

setup_logging()
logger = logging.getLogger(__name__)

NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
# URL под proto query.incident.classifier.v1 (см. medincident-backend):
#   GET /v1/organizations/{organization_id}/incident-categories:patient-visible
# Mock-сервис игнорирует значение organization_id и отдаёт фиксированный набор.
_DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"
CATEGORIES_URL = os.getenv(
    "CATEGORIES_URL",
    f"http://categories-service-mock:8000/v1/organizations/{_DEFAULT_ORG_ID}"
    f"/incident-categories:patient-visible",
)
CATEGORIES_POLL_INTERVAL = float(os.getenv("CATEGORIES_POLL_INTERVAL", "60"))

classifier = ImportanceClassifier()
processor = TextProcessor()
matcher = CategoryMatcher()
categories_cache: list[dict] = []


def _apply_categories(raw: list[dict]) -> None:
    global categories_cache
    categories_cache = raw
    matcher.update_categories(raw)
    logger.info("Categories updated: %d categories", len(raw))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading NLP models...")
    classifier.load()
    processor.load()
    matcher.load()
    logger.info("All models loaded")

    nc = None
    poll_task = None
    analyze_sub = None

    initial_fingerprint = await load_categories_with_retry(
        CATEGORIES_URL, _apply_categories
    )
    if initial_fingerprint is None:
        logger.error(
            "Failed to load categories from %s — matcher will return null until poller succeeds",
            CATEGORIES_URL,
        )

    poll_task = asyncio.create_task(
        poll_categories(
            CATEGORIES_URL,
            _apply_categories,
            interval=CATEGORIES_POLL_INTERVAL,
            initial_fingerprint=initial_fingerprint,
        )
    )

    try:
        nc = await connect_with_retry(NATS_URL)
        analyze_sub = await subscribe_analyze(
            nc,
            classifier,
            processor,
            matcher,
            run_pipeline,
            pipeline_duration_seconds,
            pipeline_requests_total,
            classifier_predictions_total,
        )
    except Exception as exc:
        logger.error("NATS unavailable: %s — /analyze over NATS will be disabled", exc)

    yield

    if analyze_sub:
        await analyze_sub.unsubscribe()
    if poll_task:
        poll_task.cancel()
    if nc:
        await nc.drain()


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
    reason: str
    formalized_text: str
    theses: list[str]
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
