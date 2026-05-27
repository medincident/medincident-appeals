from __future__ import annotations

import asyncio
import importlib
import logging
import os

from .cache import CategoryCache

logger = logging.getLogger(__name__)


class StaticCategorySource:
    """Загружает CATEGORIES из python-модуля (по умолчанию `mock_categories`).
    Удобно для локальной разработки и тестов без NATS.
    """

    def __init__(self, module_name: str = "mock_categories", attr_name: str = "CATEGORIES") -> None:
        self.module_name = module_name
        self.attr_name = attr_name

    async def warmup(self, cache: CategoryCache) -> bool:
        try:
            module = importlib.import_module(self.module_name)
            cache.set(getattr(module, self.attr_name))
            logger.info("Static: loaded %d categories from %s", cache.size(), self.module_name)
            return True
        except (ImportError, AttributeError) as exc:
            logger.warning("Static categories not available: %s", exc)
            return False

    async def watch(self, cache: CategoryCache) -> None:
        while True:
            await asyncio.sleep(3600)

    async def close(self) -> None:
        pass


def from_env() -> StaticCategorySource:
    return StaticCategorySource(
        module_name=os.getenv("CATEGORIES_STATIC_MODULE", "mock_categories"),
        attr_name=os.getenv("CATEGORIES_STATIC_ATTR", "CATEGORIES"),
    )
