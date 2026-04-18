FROM python:3.12-slim

# системные зависимости для torch и sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_SYSTEM_PYTHON=1 \
    # Torch по умолчанию ищет CUDA — отключаем лишние предупреждения
    CUDA_VISIBLE_DEVICES="" \
    # HuggingFace кэш — монтируем как volume для persistence
    HF_HOME=/app/models_cache \
    TRANSFORMERS_CACHE=/app/models_cache \
    SENTENCE_TRANSFORMERS_HOME=/app/models_cache

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 8000

# Модели скачиваются при первом запуске в volume /app/models_cache
# При последующих запусках — мгновенный старт (маркер .models_loaded)
ENTRYPOINT ["./entrypoint.sh"]
