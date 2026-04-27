# syntax=docker/dockerfile:1.6
FROM ollama/ollama:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    OLLAMA_MODEL=qwen2.5:3b \
    NATS_URL=nats://nats:4222 \
    HTTP_PORT=11434

COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv && uv pip install --no-cache-dir .

COPY . .

EXPOSE 11434

ENTRYPOINT ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "11434"]
