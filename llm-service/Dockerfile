# Этап 1: собираем Go-бинарь в чистом golang-образе.
FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o llm-service .

# Этап 2: базовый образ ollama/ollama + наш Go-бинарь.
# Go-бинарь запускает `ollama serve` как subprocess, добавляет свой HTTP API.
FROM ollama/ollama:latest

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/llm-service /usr/local/bin/llm-service

ENV OLLAMA_MODEL=qwen2.5:3b \
    HTTP_ADDR=:11434 \
    NATS_URL=nats://nats:4222

EXPOSE 11434

# Перекрываем ENTRYPOINT базового ollama-образа: теперь точка входа — наш Go-бинарь,
# он сам стартует `ollama serve` в фоне.
ENTRYPOINT ["/usr/local/bin/llm-service"]
