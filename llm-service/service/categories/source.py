from __future__ import annotations

import logging
from typing import Protocol

from .cache import CategoryCache

logger = logging.getLogger(__name__)


class CategorySource(Protocol):
    """Источник категорий. Реализации должны:
        - warmup: один раз загрузить категории в cache (или вернуть False если не вышло)
        - watch: бесконечная задача, обновляет cache при изменениях
        - close: освободить ресурсы
    """

    async def warmup(self, cache: CategoryCache) -> bool: ...
    async def watch(self, cache: CategoryCache) -> None: ...
    async def close(self) -> None: ...
