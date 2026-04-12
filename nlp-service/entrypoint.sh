#!/bin/bash
set -e

MARKER="/app/models_cache/.models_loaded"

if [ -f "$MARKER" ]; then
  echo "[nlp-service] Models already cached, skipping download"
else
  echo "[nlp-service] First run — downloading models (~368 MB)..."
  python3 /app/load.py
  touch "$MARKER"
  echo "[nlp-service] Models cached"
fi

echo "[nlp-service] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
