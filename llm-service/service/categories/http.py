from __future__ import annotations

import asyncio
import logging
import os

import httpx

from .cache import CategoryCache

logger = logging.getLogger(__name__)


class HttpPollCategorySource:
    """Опрашивает HTTP endpoint раз в `poll_interval` секунд.

    Ожидает ответ в формате `{"categories": [...]}` или просто `[...]`.
    """

    def __init__(
        self,
        url: str,
        poll_interval: float = 60.0,
        request_timeout: float = 10.0,
    ) -> None:
        self.url = url
        self.poll_interval = poll_interval
        self.request_timeout = request_timeout

    async def warmup(self, cache: CategoryCache) -> bool:
        return await self._fetch(cache)

    async def watch(self, cache: CategoryCache) -> None:
        while True:
            await asyncio.sleep(self.poll_interval)
            await self._fetch(cache)

    async def close(self) -> None:
        pass

    async def _fetch(self, cache: CategoryCache) -> bool:
        try:
            async with httpx.AsyncClient(timeout=self.request_timeout) as client:
                resp = await client.get(self.url)
                resp.raise_for_status()
                body = resp.json()
            data = body.get("categories", body) if isinstance(body, dict) else body
            cache.set(data)
            logger.info("HTTP: loaded %d categories from %s", cache.size(), self.url)
            return True
        except Exception as exc:
            logger.warning("HTTP categories fetch failed: %s", exc)
            return False


def from_env() -> HttpPollCategorySource:
    url = os.getenv("CATEGORIES_HTTP_URL")
    if not url:
        raise RuntimeError("CATEGORIES_HTTP_URL is required for http source")
    return HttpPollCategorySource(
        url=url,
        poll_interval=float(os.getenv("CATEGORIES_HTTP_INTERVAL", "60")),
    )
