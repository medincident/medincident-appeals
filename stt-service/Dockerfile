# syntax=docker/dockerfile:1.7

# ── Этап 1: сборка whisper.cpp (C++ → статический бинарь whisper-cli) ──────────
FROM debian:bookworm-slim AS whisper-builder
ARG WHISPER_REF=v1.7.6
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch ${WHISPER_REF} https://github.com/ggerganov/whisper.cpp.git .
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON \
  && cmake --build build --config Release -j
# Собирает всё (включая whisper-cli или main в зависимости от версии тега).
# В runtime-стадию копируем бинарь с нормализованным именем.

# ── Этап 2: сборка Go STT-сервиса ──────────────────────────────────────────────
FROM golang:1.25-bookworm AS go-builder
WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o stt-service .

# ── Этап 3: runtime ────────────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl ffmpeg libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=go-builder      /build/stt-service         /usr/local/bin/stt-service
# Копируем все бинари из build/bin и ставим симлинки с обоих имён,
# чтобы конфиг не зависел от конкретного тега whisper.cpp.
COPY --from=whisper-builder /src/build/bin/            /opt/whisper-bin/
RUN set -eux; \
    if [ -x /opt/whisper-bin/whisper-cli ]; then \
      ln -sf /opt/whisper-bin/whisper-cli /usr/local/bin/whisper-cli; \
    elif [ -x /opt/whisper-bin/main ]; then \
      ln -sf /opt/whisper-bin/main /usr/local/bin/whisper-cli; \
    else \
      echo "no whisper cli binary found in /opt/whisper-bin" >&2; ls -la /opt/whisper-bin; exit 1; \
    fi

ENV HTTP_ADDR=:8001 \
    WHISPER_BIN=/usr/local/bin/whisper-cli \
    WHISPER_MODEL_PATH=/models/ggml-small.bin \
    WHISPER_MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin \
    STT_MAX_AUDIO_SECONDS=60 \
    STT_MAX_BYTES=10485760

EXPOSE 8001

ENTRYPOINT ["/usr/local/bin/stt-service"]
