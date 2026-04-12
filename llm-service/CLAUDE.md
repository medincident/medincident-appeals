# llm-service — Self-hosted LLM через Ollama

## Что делает

Запускает Qwen2.5-3B через Ollama и предоставляет OpenAI-совместимый REST API для обработки обращений пациентов. Это **Подход 1** из двух реализаций в проекте — полный JSON в одном вызове к LLM.

---

## Как работает

```
backend / test_llm.py
        │
        ▼  POST /v1/chat/completions
┌──────────────────┐
│   Ollama server  │  порт 11434 (только внутри Docker-сети)
│   qwen2.5:3b     │  1.9 GB GGUF, Q4_K_M quantization
└──────────────────┘
        │
        ▼
     JSON ответ
```

Запрос строится из двух частей:
- **system**: инструкции по задаче + схема JSON
- **user**: `"Обращение пациента:\n{complaint}\n\nДоступные категории:\n..."` (категории из NATS)

---

## Структура файлов

```
llm-service/
├── Dockerfile         # FROM ollama/ollama:latest + curl + entrypoint
├── entrypoint.sh      # запуск Ollama, ожидание готовности, pull модели
└── CLAUDE.md
```

---

## Dockerfile

- Базовый образ: `ollama/ollama:latest`
- Добавляет `curl` для healthcheck
- Переменная `OLLAMA_MODEL` (default: `qwen2.5:3b`) — модель задаётся снаружи

## entrypoint.sh

1. Запускает `ollama serve` в фоне
2. Ждёт пока `GET /` вернёт 200
3. Проверяет `ollama list` — если модель уже скачана, пропускает pull
4. Скачивает модель (`ollama pull $MODEL`) если нужно — ~1.9 GB, первый запуск
5. `wait $OLLAMA_PID` — держит контейнер живым

---

## Docker Compose

```yaml
llm-service:
  environment:
    OLLAMA_MODEL: qwen2.5:3b
  volumes:
    - ollama_data:/root/.ollama   # модель сохраняется между перезапусками
  healthcheck:
    test: curl -sf http://localhost:11434/
    start_period: 180s            # 3 минуты на скачивание модели
```

Порт 11434 **не пробрасывается наружу** — доступен только внутри Docker-сети по имени `llm-service:11434`.

---

## API

OpenAI-совместимый формат:

```bash
POST http://llm-service:11434/v1/chat/completions
{
  "model": "qwen2.5:3b",
  "messages": [
    {"role": "system", "content": "...инструкции..."},
    {"role": "user", "content": "Обращение пациента:\n...\n\nДоступные категории:\n..."}
  ],
  "stream": false
}
```

---

## Тестирование с хоста

Контейнер не имеет внешнего порта. Для тестов с хоста используй `test_llm.py` — он автоматически определяет IP контейнера через `docker inspect`.

```bash
# из корня проекта:
python3 test_llm.py                   # 1 важный пример
python3 test_llm.py --not-important   # 1 неважный
python3 test_llm.py --n 5             # 5 примеров + summary
```

---

## Модель: Qwen2.5-3B

- **Семейство**: Qwen2.5 (Alibaba Cloud)
- **Параметры**: 3.1B
- **Квантизация**: Q4_K_M (4-bit) — баланс качества и размера
- **Размер файла**: ~1.9 GB
- **Контекстное окно**: 32K токенов
- **Языки**: хорошо поддерживает русский и китайский
- **Особенности без fine-tune**: может смешивать китайские иероглифы в ответах, изобретать category_id

---

## GPU

На текущей машине GPU отсутствует (только QEMU virtual VGA). Конфигурация для NVIDIA закомментирована в docker-compose.yml:

```yaml
# deploy:
#   resources:
#     reservations:
#       devices:
#         - driver: nvidia
#           count: all
#           capabilities: [gpu]
```

Раскомментировать при наличии NVIDIA GPU + NVIDIA Container Toolkit.

---

## Производительность

| | CPU (текущее) | GPU (NVIDIA) |
|--|---------------|--------------|
| Время ответа | ~130s | ~3-5s |
| Память | ~4 GB RAM | ~4 GB VRAM |

---

## Сравнение с NLP-подходом (nlp-service)

| | llm-service | nlp-service |
|--|-------------|-------------|
| Размер | ~1.9 GB | ~370 MB |
| Скорость (CPU) | ~130s | ~1s |
| Качество без обучения | Лучше | Среднее |
| Требует fine-tune | Опционально | Для хорошего качества |
| Новые категории | Через промпт | Автоматически |
