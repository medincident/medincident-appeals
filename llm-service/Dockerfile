FROM ollama/ollama:latest

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Модель задаётся через env-переменную, по умолчанию qwen2.5:3b
ENV OLLAMA_MODEL=qwen2.5:3b

EXPOSE 11434

ENTRYPOINT ["/entrypoint.sh"]
