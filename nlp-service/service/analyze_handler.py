"""NATS-обработчик /analyze запросов с queue group для горизонтального скейла."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

ANALYZE_SUBJECT = "nlp.analyze"
QUEUE_GROUP = "nlp-workers"
ERROR_HEADER = "Nats-Error"


async def subscribe_analyze(
    nc,
    classifier,
    processor,
    matcher,
    pipeline_fn,
    pipeline_duration_seconds,
    pipeline_requests_total,
    classifier_predictions_total,
):
    """Возвращает Subscription. Воркеры одной queue group делят нагрузку."""

    async def handle(msg):
        if not msg.reply:
            logger.warning("nlp.analyze: msg without reply inbox, dropping")
            return

        try:
            payload = json.loads(msg.data) if msg.data else {}
            text = (payload.get("text") or "").strip()
            if not text:
                await nc.publish(msg.reply, b"", headers={ERROR_HEADER: "text must not be empty"})
                return

            categories: list[dict[str, Any]] | None = payload.get("categories")

            loop = asyncio.get_event_loop()
            with pipeline_duration_seconds.time():
                try:
                    result = await loop.run_in_executor(
                        None,
                        pipeline_fn,
                        text,
                        categories,
                        classifier,
                        processor,
                        matcher,
                    )
                except Exception as exc:
                    logger.exception("pipeline failed for nlp.analyze")
                    pipeline_requests_total.labels(outcome="error").inc()
                    await nc.publish(
                        msg.reply,
                        b"",
                        headers={ERROR_HEADER: f"pipeline error: {type(exc).__name__}"},
                    )
                    return

            outcome = "important" if result["is_important"] else "not_important"
            pipeline_requests_total.labels(outcome=outcome).inc()
            classifier_predictions_total.labels(label=outcome).inc()
            await msg.respond(json.dumps(result).encode())
        except json.JSONDecodeError:
            await nc.publish(msg.reply, b"", headers={ERROR_HEADER: "invalid json"})
        except Exception:
            logger.exception("nlp.analyze handler crashed")
            with contextlib.suppress(Exception):
                await nc.publish(msg.reply, b"", headers={ERROR_HEADER: "internal error"})

    sub = await nc.subscribe(ANALYZE_SUBJECT, queue=QUEUE_GROUP, cb=handle)
    logger.info("Subscribed to %s (queue=%s)", ANALYZE_SUBJECT, QUEUE_GROUP)
    return sub
