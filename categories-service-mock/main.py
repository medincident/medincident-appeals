"""
Categories Service — публикует категории мединцидентов в NATS JetStream KV.

Поведение:
  1. Подключается к NATS (с ретраями).
  2. Создаёт (или открывает) KV-bucket "medincident".
  3. Публикует категории по ключу "categories" — только если содержимое
     отличается от того, что уже лежит (чтобы не плодить лишние revision
     и не будить watcher'ов nlp-service/backend без причины).
  4. Остаётся в живых: на reconnect_cb и на disconnected_cb от NATS снова
     убеждается, что bucket и ключ на месте. Это важно, потому что JetStream
     теперь на диске, но volume может быть пересоздан — тогда после reconnect
     bucket исчезнет и нужно его воссоздать.

Почему не oneshot: при рестарте NATS (или пересоздании его volume'а)
сервис должен самостоятельно восстановить состояние — иначе nlp-service
будет крашиться на "stream not found" до ручного вмешательства.
"""

import asyncio
import json
import logging
import signal
import sys

import nats
from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
from nats.js.api import KeyValueConfig
from nats.js.errors import BucketNotFoundError

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
NATS_CONNECT_DELAY = 2.0


def _payload() -> bytes:
    return json.dumps(CATEGORIES, ensure_ascii=False).encode("utf-8")


async def _ensure_bucket(js: JetStreamContext):
    """Идемпотентно открывает или создаёт KV-bucket."""
    try:
        kv = await js.key_value(KV_BUCKET)
        logger.info("Opened existing KV bucket '%s'", KV_BUCKET)
        return kv
    except BucketNotFoundError:
        kv = await js.create_key_value(KeyValueConfig(bucket=KV_BUCKET))
        logger.info("Created new KV bucket '%s'", KV_BUCKET)
        return kv


async def _publish_if_changed(kv) -> None:
    """Пишет в KV только если значение отличается — чтобы не плодить revision."""
    payload = _payload()
    try:
        current = await kv.get(KV_KEY)
        if current.value == payload:
            logger.info(
                "Categories unchanged (revision=%d) — skipping publish",
                current.revision,
            )
            return
    except Exception:
        # KeyNotFoundError или подобное — ключа ещё нет, будем публиковать.
        pass

    revision = await kv.put(KV_KEY, payload)
    total_sub = sum(len(c["subcategories"]) for c in CATEGORIES)
    logger.info(
        "Published '%s' (revision=%d, %d categories / %d subcategories, %d bytes)",
        KV_KEY,
        revision,
        len(CATEGORIES),
        total_sub,
        len(payload),
    )


async def sync_state(nc: NATS) -> None:
    """Полный цикл: получить JS-контекст, убедиться в bucket, опубликовать."""
    js = nc.jetstream()
    kv = await _ensure_bucket(js)
    await _publish_if_changed(kv)


async def connect_and_sync() -> NATS:
    """Подключается к NATS с ретраями и сразу делает первичный sync."""
    nc: NATS | None = None

    async def disconnected_cb():
        logger.warning("NATS disconnected")

    async def reconnected_cb():
        # После реконнекта JetStream может оказаться с другим состоянием
        # (например, если volume был пересоздан) — восстанавливаем bucket/ключ.
        logger.info("NATS reconnected — re-syncing categories")
        try:
            await sync_state(nc)  # noqa: F821 — nc замкнут после connect ниже
        except Exception as exc:
            logger.error("Re-sync after reconnect failed: %s", exc)

    async def error_cb(exc):
        logger.warning("NATS error: %s", exc)

    for attempt in range(1, NATS_CONNECT_RETRIES + 1):
        try:
            nc = await nats.connect(
                NATS_URL,
                disconnected_cb=disconnected_cb,
                reconnected_cb=reconnected_cb,
                error_cb=error_cb,
                max_reconnect_attempts=-1,  # бесконечно — это долгоживущий сервис
                reconnect_time_wait=2,
            )
            logger.info("Connected to NATS at %s", NATS_URL)
            break
        except Exception as exc:
            logger.warning(
                "NATS connect attempt %d/%d failed: %s",
                attempt,
                NATS_CONNECT_RETRIES,
                exc,
            )
            if attempt < NATS_CONNECT_RETRIES:
                await asyncio.sleep(NATS_CONNECT_DELAY)
    else:
        logger.error("Could not connect to NATS after %d attempts. Exiting.",
                     NATS_CONNECT_RETRIES)
        sys.exit(1)

    await sync_state(nc)
    return nc


async def main() -> None:
    logger.info("Starting categories-service (long-lived mode)")
    logger.info("Will publish %d categories to NATS KV", len(CATEGORIES))

    nc = await connect_and_sync()

    # Остаёмся в живых до SIGTERM/SIGINT — чтобы reconnect_cb мог срабатывать.
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    logger.info("Standing by — will re-sync on NATS reconnect. Ctrl+C to stop.")
    await stop.wait()

    logger.info("Shutdown signal received")
    await nc.drain()
    logger.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
