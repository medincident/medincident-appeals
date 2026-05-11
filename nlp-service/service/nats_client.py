"""Подключение к NATS — используется только для подписки на nlp.analyze."""

from __future__ import annotations

import asyncio
import logging

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
