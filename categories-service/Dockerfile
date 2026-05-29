# ── builder: ставит зависимости + генерирует OpenAPI-клиент из swagger ──────
FROM python:3.12-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# node нужен для swagger2openapi (swagger 2.0 -> openapi 3.0); openapi-python-client — генератор.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

# Генерируем клиент из закоммиченного swagger в generated/backend (gitignored).
COPY medincident.swagger.json ./
COPY scripts ./scripts
RUN uv pip install openapi-python-client \
    && sh scripts/generate_client.sh

# ── runtime: тонкий образ без node ──────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/generated /app/generated
COPY . .

CMD ["python", "main.py"]
