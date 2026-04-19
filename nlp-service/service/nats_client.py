"""Подключение к NATS + watcher KV-ключа с категориями."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable

logger = logging.getLogger(__name__)


async def connect_with_retry(url: str, max_attempts: int = 20, delay: float = 3.0):
    import nats

    for attempt in range(1, max_attempts + 1):
        try:
            nc = await nats.connect(url)
            logger.info("Connected to NATS: %s", url)
            return nc
        except Exception as exc:
            logger.warning(
                "NATS connect attempt %d/%d failed: %s",
                attempt,
                max_attempts,
                exc,
            )
            await asyncio.sleep(delay)
    raise RuntimeError(f"Cannot connect to NATS after {max_attempts} attempts")


async def load_categories(
    js,
    bucket: str,
    key: str,
    on_update: Callable[[list[dict]], None],
) -> bool:
    try:
        kv = await js.key_value(bucket)
        entry = await kv.get(key)
        raw = json.loads(entry.value.decode("utf-8"))
        on_update(raw)
        return True
    except Exception as exc:
        logger.warning("Cannot load categories from NATS KV: %s", exc)
        return False


async def watch_categories(
    js,
    bucket: str,
    key: str,
    on_update: Callable[[list[dict]], None],
) -> None:
    """Бесконечная подписка: вызывает on_update при каждом изменении ключа."""
    while True:
        try:
            kv = await js.key_value(bucket)
            watcher = await kv.watchall()
            async for entry in watcher:
                if entry and entry.key == key:
                    raw = json.loads(entry.value.decode("utf-8"))
                    on_update(raw)
        except Exception as exc:
            logger.warning("KV watcher error: %s — restarting in 5s", exc)
            await asyncio.sleep(5.0)
