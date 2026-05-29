from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def serialize(categories: list[dict]) -> bytes:
    return json.dumps(categories, ensure_ascii=False).encode("utf-8")


async def publish_if_changed(kv, key: str, categories: list[dict]) -> bool:
    """Пишет категории в KV только если содержимое отличается. Возвращает True,
    если была публикация. Пустой список не публикуем (защита от затирания)."""
    if not categories:
        logger.warning("0 categories — not publishing (avoid wiping valid KV)")
        return False

    payload = serialize(categories)
    try:
        current = await kv.get(key)
        if current.value == payload:
            logger.info("Categories unchanged (revision=%d) — skipping publish", current.revision)
            return False
    except Exception:
        # KeyNotFoundError или подобное — ключа ещё нет, публикуем.
        pass

    revision = await kv.put(key, payload)
    total_sub = sum(len(c.get("subcategories", [])) for c in categories)
    logger.info(
        "Published (revision=%d, %d categories / %d subcategories, %d bytes)",
        revision,
        len(categories),
        total_sub,
        len(payload),
    )
    return True
