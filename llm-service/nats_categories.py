from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable

logger = logging.getLogger(__name__)


class CategoryCache:
    def __init__(self) -> None:
        self._data: list[dict] = []
        self._lock = asyncio.Lock()

    async def set(self, value: list[dict]) -> None:
        async with self._lock:
            self._data = value

    async def snapshot(self) -> list[dict]:
        async with self._lock:
            return list(self._data)

    async def size(self) -> int:
        async with self._lock:
            return len(self._data)


async def connect_with_retry(url: str, max_attempts: int = 15, delay: float = 2.0):
    import nats

    for attempt in range(1, max_attempts + 1):
        try:
            nc = await nats.connect(url)
            logger.info("Connected to NATS: %s", url)
            return nc
        except Exception as exc:
            logger.warning("NATS connect %d/%d failed: %s", attempt, max_attempts, exc)
            await asyncio.sleep(delay)
    raise RuntimeError(f"Cannot connect to NATS after {max_attempts} attempts")


async def load_categories_once(
    js,
    bucket: str,
    key: str,
    on_update: Callable[[list[dict]], asyncio.Future | None],
) -> bool:
    try:
        kv = await js.key_value(bucket)
        entry = await kv.get(key)
        raw = json.loads(entry.value.decode("utf-8"))
        await on_update(raw)
        return True
    except Exception as exc:
        logger.warning("Cannot load categories from NATS KV: %s", exc)
        return False


async def watch_categories(
    js,
    bucket: str,
    key: str,
    on_update: Callable[[list[dict]], asyncio.Future | None],
) -> None:
    while True:
        try:
            kv = await js.key_value(bucket)
            watcher = await kv.watchall()
            async for entry in watcher:
                if entry and entry.key == key:
                    raw = json.loads(entry.value.decode("utf-8"))
                    await on_update(raw)
                    logger.info("Categories updated: %d", len(raw))
        except Exception as exc:
            logger.warning("KV watcher error: %s — restarting in 5s", exc)
            await asyncio.sleep(5.0)
