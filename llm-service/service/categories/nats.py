from __future__ import annotations

import asyncio
import json
import logging
import os

from .cache import CategoryCache

logger = logging.getLogger(__name__)


class NatsKvCategorySource:
    """Категории из NATS JetStream KV.

    warmup: до `max_attempts` попыток с задержкой `delay` сек.
    watch:  подписывается на KV bucket, обновляет cache при изменениях.
    """

    def __init__(
        self,
        url: str,
        bucket: str = "medincident",
        key: str = "categories",
        connect_attempts: int = 15,
        connect_delay: float = 2.0,
        warmup_attempts: int = 20,
        warmup_delay: float = 2.0,
    ) -> None:
        self.url = url
        self.bucket = bucket
        self.key = key
        self.connect_attempts = connect_attempts
        self.connect_delay = connect_delay
        self.warmup_attempts = warmup_attempts
        self.warmup_delay = warmup_delay
        self._nc = None
        self._js = None

    async def warmup(self, cache: CategoryCache) -> bool:
        await self._ensure_connected()
        if self._js is None:
            return False

        for attempt in range(1, self.warmup_attempts + 1):
            if await self._try_fetch(cache):
                return True
            if attempt < self.warmup_attempts:
                await asyncio.sleep(self.warmup_delay)
        logger.warning("NATS warmup: failed after %d attempts", self.warmup_attempts)
        return False

    async def watch(self, cache: CategoryCache) -> None:
        await self._ensure_connected()
        while True:
            try:
                kv = await self._js.key_value(self.bucket)
                watcher = await kv.watchall()
                async for entry in watcher:
                    if entry and entry.key == self.key:
                        cache.set(json.loads(entry.value.decode("utf-8")))
                        logger.info("NATS: categories updated (%d)", cache.size())
            except Exception as exc:
                logger.warning("NATS watcher error: %s — restarting in 5s", exc)
                await asyncio.sleep(5.0)

    async def close(self) -> None:
        if self._nc:
            await self._nc.drain()
            self._nc = None
            self._js = None

    @property
    def is_connected(self) -> bool:
        return bool(self._nc and self._nc.is_connected)

    async def _ensure_connected(self) -> None:
        if self._nc:
            return
        import nats

        for attempt in range(1, self.connect_attempts + 1):
            try:
                self._nc = await nats.connect(self.url)
                self._js = self._nc.jetstream()
                logger.info("NATS connected: %s", self.url)
                return
            except Exception as exc:
                logger.warning("NATS connect %d/%d failed: %s",
                               attempt, self.connect_attempts, exc)
                if attempt < self.connect_attempts:
                    await asyncio.sleep(self.connect_delay)
        logger.error("NATS connect: gave up after %d attempts", self.connect_attempts)

    async def _try_fetch(self, cache: CategoryCache) -> bool:
        try:
            kv = await self._js.key_value(self.bucket)
            entry = await kv.get(self.key)
            cache.set(json.loads(entry.value.decode("utf-8")))
            logger.info("NATS: warmup loaded %d categories", cache.size())
            return True
        except Exception as exc:
            logger.debug("NATS warmup: %s", exc)
            return False


def from_env() -> NatsKvCategorySource:
    return NatsKvCategorySource(
        url=os.getenv("NATS_URL", "nats://nats:4222"),
        bucket=os.getenv("CATEGORIES_NATS_BUCKET", "medincident"),
        key=os.getenv("CATEGORIES_NATS_KEY", "categories"),
    )
