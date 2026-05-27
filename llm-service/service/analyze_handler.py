from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

ANALYZE_SUBJECT = "llm.analyze"
QUEUE_GROUP = "llm-workers"
ERROR_HEADER = "Nats-Error"


def _to_response_payload(result: dict) -> dict:
    return {
        "is_important": result["is_important"],
        "important_confidence": 1.0 if result["is_important"] else 0.0,
        "formalized_text": result.get("formalized_text", ""),
        "category": result.get("category"),
        "subcategory": result.get("subcategory"),
    }


async def subscribe_analyze(nc, client, cache, run_analyze_fn):
    async def handle(msg):
        if not msg.reply:
            logger.warning("llm.analyze: msg without reply inbox, dropping")
            return

        try:
            payload = json.loads(msg.data) if msg.data else {}
            text = (payload.get("text") or "").strip()
            if not text:
                await msg.respond(b"", headers={ERROR_HEADER: "text must not be empty"})
                return

            categories: list[dict[str, Any]] = cache.snapshot()

            try:
                result = await run_analyze_fn(client, text, categories)
            except Exception as exc:
                logger.exception("pipeline failed for llm.analyze")
                await msg.respond(
                    b"", headers={ERROR_HEADER: f"pipeline error: {type(exc).__name__}"}
                )
                return

            response = _to_response_payload(result)
            await msg.respond(json.dumps(response).encode())
        except json.JSONDecodeError:
            await msg.respond(b"", headers={ERROR_HEADER: "invalid json"})
        except Exception:
            logger.exception("llm.analyze handler crashed")
            with contextlib.suppress(Exception):
                await msg.respond(b"", headers={ERROR_HEADER: "internal error"})

    sub = await nc.subscribe(ANALYZE_SUBJECT, queue=QUEUE_GROUP, cb=handle)
    logger.info("Subscribed to %s (queue=%s)", ANALYZE_SUBJECT, QUEUE_GROUP)
    return sub
