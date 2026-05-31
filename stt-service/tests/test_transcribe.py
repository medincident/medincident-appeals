"""Интеграционные тесты эндпоинтов. Модель грузится в lifespan — TestClient как контекст-менеджер."""

import io
import math
import struct
import wave

import pytest
from fastapi.testclient import TestClient

import main


def _wav_bytes(seconds: float = 1.0, freq: int = 220) -> io.BytesIO:
    buf = io.BytesIO()
    with wave.open(buf, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        n = int(16000 * seconds)
        w.writeframes(
            b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * freq * t / 16000))) for t in range(n))
        )
    buf.seek(0)
    return buf


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_transcribe_returns_text(client):
    r = client.post("/transcribe", files={"audio": ("rec.wav", _wav_bytes(), "audio/wav")})
    assert r.status_code == 200
    assert "text" in r.json()
    assert isinstance(r.json()["text"], str)


def test_transcribe_rejects_empty(client):
    r = client.post("/transcribe", files={"audio": ("empty.wav", io.BytesIO(b""), "audio/wav")})
    assert r.status_code == 422
