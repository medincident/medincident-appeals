#!/bin/bash
set -e

MARKER="/app/models_cache/.${STT_MODEL:-small}_loaded"

if [ -f "$MARKER" ]; then
  echo "[stt-service] Model ${STT_MODEL:-small} already cached, skipping download"
else
  echo "[stt-service] First run — downloading model ${STT_MODEL:-small}..."
  python3 -c "from faster_whisper import WhisperModel; WhisperModel('${STT_MODEL:-small}', device='cpu', compute_type='${STT_COMPUTE_TYPE:-int8}')"
  touch "$MARKER"
  echo "[stt-service] Model cached"
fi

echo "[stt-service] Starting uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
