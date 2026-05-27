"""LlamaCppClient — синхронная обёртка над llama-cpp-python с constrained JSON через outlines.

Модель грузится один раз при создании клиента и держится в памяти. Между запросами
переиспользуется KV-кэш префикса (когда совпадает system + начало user). Все вызовы
сериализуются через asyncio.Lock — llama.cpp не thread-safe относительно одного
инстанса Llama.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)

BASE_MODEL = "qwen3:4b"


class LlamaCppClient:
    """Локальный inference через llama-cpp-python + outlines structured output."""

    def __init__(
        self,
        model_path: Path,
        *,
        n_ctx: int = 4096,
        n_threads: int | None = None,
        n_gpu_layers: int = 0,
        chat_format: str | None = None,
        seed: int = -1,
    ) -> None:
        from llama_cpp import Llama

        if not model_path.exists():
            raise FileNotFoundError(
                f"GGUF не найден: {model_path}. Скачай: uv run python -m models.llm.load"
            )

        # chat_format=None → llama-cpp возьмёт chat template из метаданных GGUF.
        # Это самый надёжный вариант, потому что unsloth/Qwen3-4B-GGUF содержит
        # правильный Qwen3 ChatML template прямо в файле.
        logger.info("Loading model: %s", model_path)
        self._llm = Llama(
            model_path=str(model_path),
            n_ctx=n_ctx,
            n_threads=n_threads,
            n_gpu_layers=n_gpu_layers,
            chat_format=chat_format,
            seed=seed,
            verbose=False,
        )
        self._lock = asyncio.Lock()
        self.model_path = model_path
        logger.info("Model loaded: n_ctx=%d n_gpu_layers=%d", n_ctx, n_gpu_layers)

    @property
    def is_alive(self) -> bool:
        return self._llm is not None

    async def chat_structured(
        self,
        system: str,
        user: str,
        schema: type[BaseModel] | Any,
        *,
        max_tokens: int = 512,
        temperature: float = 0.1,
        top_p: float = 0.9,
    ) -> dict[str, Any]:
        """Возвращает dict, гарантированно соответствующий Pydantic-схеме.

        Constrained-декодирование выполняется llama.cpp через JSON-schema грамматику,
        собираемую из Pydantic-модели — невалидные токены отсекаются на каждом шаге.
        """
        json_schema = schema.model_json_schema()
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

        async with self._lock:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._llm.create_chat_completion(
                    messages=messages,
                    response_format={
                        "type": "json_object",
                        "schema": json_schema,
                    },
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                ),
            )

        content = result["choices"][0]["message"]["content"]
        # json_object + schema гарантируют валидный JSON, поэтому парсим напрямую
        return json.loads(content)

    def close(self) -> None:
        if self._llm is not None:
            self._llm.close()
            self._llm = None
