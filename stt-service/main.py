"""FastAPI-сервис распознавания речи на faster-whisper. Эндпоинты: /transcribe, /health."""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("stt-service")

STT_MODEL = os.getenv("STT_MODEL", "small")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "ru")
# int8 — квантизация для CPU: вчетверо меньше памяти и быстрее float32 без заметной потери качества.
STT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")
# Загруженное аудио ограничиваем, чтобы один запрос не выел всю память сервиса.
MAX_AUDIO_BYTES = int(os.getenv("STT_MAX_AUDIO_BYTES", str(25 * 1024 * 1024)))

# Грузим модель один раз на старте — загрузка медленная, инференс должен быть готов сразу.
_model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    logger.info("Loading faster-whisper model=%s compute_type=%s", STT_MODEL, STT_COMPUTE_TYPE)
    _model = WhisperModel(STT_MODEL, device="cpu", compute_type=STT_COMPUTE_TYPE)
    logger.info("Model loaded")
    yield
    _model = None


app = FastAPI(title="STT Service", version="0.1.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Не отдаём traceback клиенту: в repr(exc) может попасть содержимое аудио/пути.
    logger.error("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


def _transcribe_file(path: str) -> str:
    assert _model is not None
    segments, _info = _model.transcribe(path, language=STT_LANGUAGE, beam_size=5)
    return " ".join(seg.text.strip() for seg in segments).strip()


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    data = await audio.read()
    if not data:
        raise HTTPException(status_code=422, detail="empty audio")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio too large")

    # faster-whisper декодирует контейнер сам (PyAV), но читает с диска — пишем во временный файл.
    with tempfile.NamedTemporaryFile(suffix=".bin") as tmp:
        tmp.write(data)
        tmp.flush()
        loop = asyncio.get_event_loop()
        # Инференс синхронный и CPU-bound — уводим в executor, чтобы не блокировать event loop.
        text = await loop.run_in_executor(None, _transcribe_file, tmp.name)

    return {"text": text}


@app.get("/health")
async def health():
    healthy = _model is not None
    return JSONResponse(
        {"status": "ok" if healthy else "loading", "model": STT_MODEL},
        status_code=200 if healthy else 503,
    )
