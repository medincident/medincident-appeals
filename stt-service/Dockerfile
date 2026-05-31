# --- Stage 1: Base ---
FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app
WORKDIR /app

# --- Stage 2: Builder ---
FROM base AS builder
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# --- Stage 3: Runtime ---
FROM base AS runtime
# CTranslate2 (движок faster-whisper) — CPU-only сборка; HF_HOME указывает на volume-кэш моделей.
ENV HF_HOME=/app/models_cache
COPY --from=builder /app/.venv /app/.venv
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
