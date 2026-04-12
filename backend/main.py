"""
AI Medincident Backend

При старте:
  1. Подключается к NATS
  2. Читает категории из JetStream KV (с повторными попытками — categories-service
     может стартовать позже)
  3. Кэширует категории в памяти
  4. Подписывается на обновления KV — при изменении категорий обновляет кэш
  5. Логирует каждую принятую категорию и подкатегорию
"""

import asyncio
import json
import logging
import sys
from typing import Any

import nats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("ai-medincident-backend")

NATS_URL = "nats://nats:4222"
KV_BUCKET = "medincident"
KV_KEY = "categories"

NATS_CONNECT_RETRIES = 15
NATS_CONNECT_DELAY = 2.0

# Категории хранятся в памяти: { cat_id: { ...category } }
categories_cache: dict[str, Any] = {}


def _apply_categories(raw: list[dict]) -> None:
    """Обновить кэш и залогировать каждую категорию/подкатегорию."""
    categories_cache.clear()
    for cat in raw:
        categories_cache[cat["id"]] = cat

    total_sub = sum(len(c["subcategories"]) for c in raw)
    logger.info(
        "Cache updated: %d categories, %d subcategories",
        len(raw),
        total_sub,
    )
    for cat in raw:
        logger.info("  [category] id=%-8s  %s", cat["id"], cat["name"])
        for sub in cat["subcategories"]:
            logger.info(
                "               └─ id=%-8s  %s",
                sub["id"],
                sub["name"],
            )


async def _load_from_kv(js: nats.js.JetStreamContext) -> bool:
    """Попытаться прочитать категории из KV прямо сейчас."""
    try:
        kv = await js.key_value(KV_BUCKET)
        entry = await kv.get(KV_KEY)
        raw: list[dict] = json.loads(entry.value.decode("utf-8"))
        logger.info(
            "Loaded %d categories from NATS KV (bucket='%s', key='%s')",
            len(raw),
            KV_BUCKET,
            KV_KEY,
        )
        _apply_categories(raw)
        return True
    except Exception as exc:
        logger.debug("KV read failed: %s", exc)
        return False


async def _load_with_retry(js: nats.js.JetStreamContext) -> None:
    """Читать KV с повторными попытками — categories-service может стартовать позже."""
    for attempt in range(1, 21):  # до 20 попыток (40 секунд)
        if await _load_from_kv(js):
            return
        logger.info(
            "Categories not yet available in KV, retrying... (attempt %d/20)",
            attempt,
        )
        await asyncio.sleep(2.0)

    logger.warning(
        "Could not load categories after 20 attempts. "
        "Will pick them up via KV watcher when categories-service publishes."
    )


async def _watch_kv(js: nats.js.JetStreamContext) -> None:
    """
    Следить за изменениями KV — обновлять кэш при каждом изменении ключа 'categories'.
    Эта корутина работает вечно.
    """
    while True:
        try:
            kv = await js.key_value(KV_BUCKET)
            watcher = await kv.watchall()
            logger.info(
                "Watching NATS KV bucket '%s' for updates...", KV_BUCKET
            )
            async for entry in watcher:
                if entry is None:
                    continue
                if entry.key != KV_KEY:
                    continue
                raw: list[dict] = json.loads(entry.value.decode("utf-8"))
                logger.info(
                    "KV update received: %d categories (revision=%s)",
                    len(raw),
                    entry.revision,
                )
                _apply_categories(raw)
        except Exception as exc:
            logger.warning("KV watcher error: %s — restarting in 5s", exc)
            await asyncio.sleep(5.0)


async def _connect_nats() -> nats.NATS:
    for attempt in range(1, NATS_CONNECT_RETRIES + 1):
        try:
            nc = await nats.connect(NATS_URL)
            logger.info("Connected to NATS at %s", NATS_URL)
            return nc
        except Exception as exc:
            logger.warning(
                "NATS connect attempt %d/%d failed: %s",
                attempt,
                NATS_CONNECT_RETRIES,
                exc,
            )
            if attempt < NATS_CONNECT_RETRIES:
                await asyncio.sleep(NATS_CONNECT_DELAY)

    logger.error("Cannot connect to NATS. Exiting.")
    sys.exit(1)


async def main() -> None:
    logger.info("Starting ai-medincident-backend")

    nc = await _connect_nats()
    js = nc.jetstream()

    # Загружаем категории (с retry на случай если categories-service ещё не готов)
    await _load_with_retry(js)

    # Запускаем watcher в фоне — будет обновлять кэш при каждом изменении категорий
    asyncio.create_task(_watch_kv(js))

    logger.info("Backend is running. Waiting for events...")

    # Основной цикл (здесь будет FastAPI / другая логика)
    while True:
        await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
