# syntax=docker/dockerfile:1.7

# --- builder: компилируем llama-cpp-python ---
FROM python:3.12-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_CUDA=OFF"

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake ninja-build ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=cache,target=/root/.cache/pip \
    uv venv && uv pip install -r pyproject.toml

# --- runtime: только runtime-зависимости + venv ---
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    LLM_REPO=unsloth/Qwen3-4B-GGUF \
    LLM_QUANT=Q4_K_M

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY . .

EXPOSE 11434
ENTRYPOINT ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "11434"]
