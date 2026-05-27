from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import nats
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from models.llm import LlamaCppClient
from models.llm.load import DEFAULT_QUANT, DEFAULT_REPO, model_path
from service import (
    CategoryCache,
    CategorySource,
    build_source,
    run_analyze,
    subscribe_analyze,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("llm-service")

LLM_REPO = os.getenv("LLM_REPO", DEFAULT_REPO)
LLM_QUANT = os.getenv("LLM_QUANT", DEFAULT_QUANT)
LLM_N_CTX = int(os.getenv("LLM_N_CTX", "4096"))
LLM_N_THREADS = int(os.getenv("LLM_N_THREADS", "0")) or None
LLM_N_GPU_LAYERS = int(os.getenv("LLM_N_GPU_LAYERS", "0"))
NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")


@dataclass
class AppState:
    client: LlamaCppClient
    cache: CategoryCache
    source: CategorySource
    nc: object | None = field(default=None)
    sub: object | None = field(default=None)
    watcher_task: asyncio.Task | None = field(default=None)


def build_state() -> AppState:
    gguf = model_path(LLM_REPO, LLM_QUANT)
    client = LlamaCppClient(
        model_path=gguf,
        n_ctx=LLM_N_CTX,
        n_threads=LLM_N_THREADS,
        n_gpu_layers=LLM_N_GPU_LAYERS,
    )
    return AppState(
        client=client,
        cache=CategoryCache(),
        source=build_source(),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    state = build_state()
    app.state.svc = state

    if not await state.source.warmup(state.cache):
        logger.warning("Categories not loaded yet — watcher will pick them up")
    state.watcher_task = asyncio.create_task(state.source.watch(state.cache))

    try:
        state.nc = await nats.connect(NATS_URL)
        logger.info("NATS connected: %s", NATS_URL)
        state.sub = await subscribe_analyze(
            state.nc, state.client, state.cache, run_analyze
        )
    except Exception:
        logger.exception("Failed to connect to NATS, llm-service runs in HTTP-only mode")

    try:
        yield
    finally:
        if state.sub is not None:
            with contextlib.suppress(Exception):
                await state.sub.unsubscribe()
        if state.nc is not None:
            with contextlib.suppress(Exception):
                await state.nc.drain()
        if state.watcher_task:
            state.watcher_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await state.watcher_task
        await state.source.close()
        state.client.close()


app = FastAPI(title="LLM Service", version="0.4.0", lifespan=lifespan)


class AnalyzeRequest(BaseModel):
    text: str


def _state(request: Request) -> AppState:
    return request.app.state.svc


@app.post("/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="text must not be empty")

    state = _state(request)
    categories = state.cache.snapshot()
    return await run_analyze(state.client, text, categories)


@app.get("/health")
async def health(request: Request):
    state = _state(request)
    return {
        "status": "ok",
        "model_loaded": state.client.is_alive,
        "model_path": str(state.client.model_path),
        "categories_cached": state.cache.size(),
        "nats_connected": state.nc is not None and state.nc.is_connected,
    }
