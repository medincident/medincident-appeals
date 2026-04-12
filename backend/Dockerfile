FROM python:3.14-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_SYSTEM_PYTHON=1

COPY pyproject.toml .
RUN uv pip install -e . --no-cache

COPY . .

CMD ["python", "main.py"]
