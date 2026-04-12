"""
Categories Service — публикует категории мединцидентов в NATS JetStream KV.

При запуске:
  1. Подключается к NATS
  2. Создаёт (или обновляет) KV-bucket "medincident"
  3. Записывает все категории по ключу "categories"
  4. Завершает работу

Бэкенд читает из KV при старте и следит за обновлениями через watcher.
"""

import asyncio
import json
import logging
import sys

import nats
from nats.js.api import KeyValueConfig

from categories import CATEGORIES

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("categories-service")

NATS_URL = "nats://nats:4222"
KV_BUCKET = "medincident"
KV_KEY = "categories"

NATS_CONNECT_RETRIES = 10
NATS_CONNECT_DELAY = 2.0  # секунд между попытками


async def connect_with_retry() -> nats.NATS:
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

    logger.error("Could not connect to NATS after %d attempts. Exiting.", NATS_CONNECT_RETRIES)
    sys.exit(1)


async def main() -> None:
    logger.info("Starting categories-service")
    logger.info("Will publish %d categories to NATS KV", len(CATEGORIES))

    nc = await connect_with_retry()

    js = nc.jetstream()

    # Создаём или открываем KV-bucket
    try:
        kv = await js.key_value(KV_BUCKET)
        logger.info("Opened existing KV bucket '%s'", KV_BUCKET)
    except Exception:
        kv = await js.create_key_value(KeyValueConfig(bucket=KV_BUCKET))
        logger.info("Created new KV bucket '%s'", KV_BUCKET)

    # Публикуем категории
    payload = json.dumps(CATEGORIES, ensure_ascii=False).encode("utf-8")
    revision = await kv.put(KV_KEY, payload)
    logger.info(
        "Published key '%s' to bucket '%s' (revision=%d, size=%d bytes)",
        KV_KEY,
        KV_BUCKET,
        revision,
        len(payload),
    )

    # Логируем что именно опубликовали
    total_subcategories = sum(len(c["subcategories"]) for c in CATEGORIES)
    logger.info(
        "Summary: %d categories, %d subcategories total",
        len(CATEGORIES),
        total_subcategories,
    )
    for cat in CATEGORIES:
        logger.info("  [cat] %s (id=%s)", cat["name"], cat["id"])
        for sub in cat["subcategories"]:
            logger.info("         └─ %s (id=%s)", sub["name"], sub["id"])

    await nc.drain()
    logger.info("Done. Categories service exiting.")


if __name__ == "__main__":
    asyncio.run(main())
