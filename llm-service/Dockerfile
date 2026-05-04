# --- Stage 1: Base ---
FROM ollama/ollama:latest AS base
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app

# --- Stage 2: Runtime ---
FROM base AS runtime
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv && uv pip install -r pyproject.toml
COPY . .
EXPOSE 11434
ENTRYPOINT ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "11434"]
