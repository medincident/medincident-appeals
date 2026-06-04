"""
Categories Service — публикует категории инцидентов в NATS JetStream KV.

Режимы (CATEGORIES_USE_STUB):
  true  — зашитые моки (mock_categories.CATEGORIES), для dev без medincident-backend.
  false — тянет реальные категории из medincident-backend под service-токеном
          (JWT-Bearer profile, machine key.json), фильтр isAllowedForPatients.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal
import sys

import nats
from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
from nats.js.api import KeyValueConfig
from nats.js.errors import BucketNotFoundError

from service import build_source, load_config, publish_if_changed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("categories-service")

NATS_CONNECT_RETRIES = 10
NATS_CONNECT_DELAY = 2.0

cfg = load_config()
source = build_source(cfg)


async def _ensure_bucket(js: JetStreamContext):
    try:
        kv = await js.key_value(cfg.kv_bucket)
        logger.info("Opened existing KV bucket '%s'", cfg.kv_bucket)
        return kv
    except BucketNotFoundError:
        kv = await js.create_key_value(KeyValueConfig(bucket=cfg.kv_bucket))
        logger.info("Created new KV bucket '%s'", cfg.kv_bucket)
        return kv


async def sync_once(nc: NATS) -> None:
    try:
        categories = await source.get_categories()
    except Exception as exc:
        logger.error("Failed to load categories — keeping existing KV value: %s", exc)
        return
    js = nc.jetstream()
    kv = await _ensure_bucket(js)
    await publish_if_changed(kv, cfg.kv_key, categories)


async def connect_and_sync() -> NATS:
    nc: NATS | None = None

    async def disconnected_cb():
        logger.warning("NATS disconnected")

    async def reconnected_cb():
        logger.info("NATS reconnected — re-syncing categories")
        try:
            await sync_once(nc)
        except Exception as exc:
            logger.error("Re-sync after reconnect failed: %s", exc)

    async def error_cb(exc):
        logger.warning("NATS error: %s", exc)

    for attempt in range(1, NATS_CONNECT_RETRIES + 1):
        try:
            nc = await nats.connect(
                cfg.nats_url,
                disconnected_cb=disconnected_cb,
                reconnected_cb=reconnected_cb,
                error_cb=error_cb,
                max_reconnect_attempts=-1,
                reconnect_time_wait=2,
            )
            logger.info("Connected to NATS at %s", cfg.nats_url)
            break
        except Exception as exc:
            logger.warning(
                "NATS connect attempt %d/%d failed: %s", attempt, NATS_CONNECT_RETRIES, exc
            )
            if attempt < NATS_CONNECT_RETRIES:
                await asyncio.sleep(NATS_CONNECT_DELAY)
    else:
        logger.error("Could not connect to NATS after %d attempts. Exiting.", NATS_CONNECT_RETRIES)
        sys.exit(1)

    await sync_once(nc)
    return nc


async def poll_loop(nc: NATS, stop: asyncio.Event) -> None:
    while not stop.is_set():
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=cfg.poll_seconds)
        if stop.is_set():
            break
        await sync_once(nc)


async def main() -> None:
    logger.info(
        "Starting categories-service (use_stub=%s, poll=%ss, bucket=%s, key=%s)",
        cfg.use_stub,
        cfg.poll_seconds,
        cfg.kv_bucket,
        cfg.kv_key,
    )

    nc = await connect_and_sync()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    poller = asyncio.create_task(poll_loop(nc, stop))
    logger.info("Standing by — polling every %ss. Ctrl+C to stop.", cfg.poll_seconds)
    await stop.wait()

    logger.info("Shutdown signal received")
    poller.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await poller
    await nc.drain()
    logger.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
