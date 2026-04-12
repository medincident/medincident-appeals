#!/bin/bash
set -e

MODEL="${OLLAMA_MODEL:-qwen2.5:3b}"

echo "[llm-service] Starting Ollama server..."
ollama serve &
OLLAMA_PID=$!

echo "[llm-service] Waiting for Ollama to be ready..."
until curl -sf http://localhost:11434/ > /dev/null 2>&1; do
  sleep 1
done
echo "[llm-service] Ollama is ready"

# Pull model only if not already present
if ollama list | grep -q "${MODEL%:*}"; then
  echo "[llm-service] Model '$MODEL' already present, skipping pull"
else
  echo "[llm-service] Pulling model '$MODEL' (may take a few minutes)..."
  ollama pull "$MODEL"
  echo "[llm-service] Model '$MODEL' ready"
fi

echo "[llm-service] LLM service is up. API at http://llm-service:11434"
wait "$OLLAMA_PID"
