from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from nats_categories import (
    CategoryCache,
    connect_with_retry,
    load_categories_once,
    watch_categories,
)
from ollama_runner import OllamaRunner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("llm-service")

OLLAMA_INTERNAL_HOST = "127.0.0.1:11435"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
HTTP_PORT = int(os.getenv("HTTP_PORT", "11434"))
KV_BUCKET = "medincident"
KV_KEY = "categories"
ANALYZE_TIMEOUT = 180.0

SYSTEM_PROMPT = (
    "Проанализируй обращение пациента и верни JSON строго по схеме без markdown и лишнего текста.\n"
    '{"is_important": bool, "reason": str, "formalized_text": str, '
    '"theses": [str], "category": {"id": str, "name": str} | null, '
    '"subcategory": {"id": str, "name": str} | null}\n'
    "is_important=true только если сообщение содержит жалобу на здоровье, "
    "условия пребывания, поведение персонала или безопасность. "
    "Категорию и подкатегорию выбирай строго из списка в обращении пациента."
)

JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)

runner = OllamaRunner(host=OLLAMA_INTERNAL_HOST, model=OLLAMA_MODEL)
cache = CategoryCache()
nats_conn = None


def build_categories_block(categories: list[dict]) -> str:
    lines = ["Доступные категории инцидентов:"]
    for cat in categories:
        lines.append(f"- [{cat['id']}] {cat['name']}")
        for sub in cat.get("subcategories", []):
            lines.append(f"    * [{sub['id']}] {sub['name']}")
    return "\n".join(lines)


def extract_json(text: str) -> str:
    match = JSON_OBJECT_RE.search(text.strip())
    return match.group(0) if match else text


async def call_ollama(model: str, system: str, user: str, timeout: float) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(runner.base_url + "/v1/chat/completions", json=payload)
        resp.raise_for_status()
        body = resp.json()
    return body["choices"][0]["message"]["content"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nats_conn

    await runner.start()

    watcher_task = None
    warmup_task = None
    try:
        nats_conn = await connect_with_retry(NATS_URL)
        js = nats_conn.jetstream()

        async def apply(raw: list[dict]) -> None:
            await cache.set(raw)

        async def warmup() -> None:
            for _ in range(20):
                if await load_categories_once(js, KV_BUCKET, KV_KEY, apply):
                    return
                await asyncio.sleep(2.0)
            logger.warning("Categories not loaded yet — watcher will pick them up")

        warmup_task = asyncio.create_task(warmup())
        watcher_task = asyncio.create_task(watch_categories(js, KV_BUCKET, KV_KEY, apply))
    except Exception as exc:
        logger.warning("NATS unavailable: %s — service starts without categories", exc)

    yield

    if warmup_task:
        warmup_task.cancel()
    if watcher_task:
        watcher_task.cancel()
    if nats_conn:
        await nats_conn.drain()
    await runner.stop()


app = FastAPI(title="LLM Service", version="0.1.0", lifespan=lifespan)


class AnalyzeRequest(BaseModel):
    text: str


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="text must not be empty")

    cats = await cache.snapshot()
    user_prompt = f"Обращение пациента:\n{text}\n\n{build_categories_block(cats)}"

    try:
        raw = await call_ollama(OLLAMA_MODEL, SYSTEM_PROMPT, user_prompt, ANALYZE_TIMEOUT)
    except httpx.HTTPError as exc:
        logger.error("Ollama call failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"llm call failed: {exc}") from exc

    try:
        result = json.loads(extract_json(raw))
    except json.JSONDecodeError:
        logger.warning("LLM returned non-JSON: %s", raw[:200])
        return {
            "is_important": True,
            "reason": "LLM returned non-JSON output",
            "formalized_text": text,
            "theses": [],
            "category": None,
            "subcategory": None,
        }

    result.setdefault("theses", [])
    result.setdefault("category", None)
    result.setdefault("subcategory", None)
    return result


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ollama_up": await runner.is_alive(),
        "nats_connected": bool(nats_conn and nats_conn.is_connected),
        "categories_cached": await cache.size(),
    }


@app.get("/categories")
async def get_categories():
    return {"categories": await cache.snapshot()}


@app.get("/")
async def root():
    return Response(content="Ollama is running", media_type="text/plain")


@app.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    target = f"{runner.base_url}{request.url.path}"
    if request.url.query:
        target = f"{target}?{request.url.query}"

    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in {"host", "content-length"}}

    async with httpx.AsyncClient(timeout=ANALYZE_TIMEOUT) as client:
        resp = await client.request(request.method, target, content=body, headers=headers)

    excluded = {"content-encoding", "transfer-encoding", "connection"}
    forwarded = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
    return Response(content=resp.content, status_code=resp.status_code, headers=forwarded)
