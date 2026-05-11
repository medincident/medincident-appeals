"""
HTTP-клиент к medincident-backend (или mock'у с тем же контрактом):
один эндпоинт `GET .../incident-categories:patient-visible` возвращает
flat-список категорий под proto query.incident.classifier.v1.

Преобразуем flat → tree (родитель + subcategories) — именно такой формат
ожидает CategoryMatcher.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _to_tree(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Складываем плоский список (с parentCategoryId) в двухуровневое дерево.
    Глубже двух уровней backend сейчас не уходит, а matcher всё равно
    работает только с (category, subcategory) — поэтому всё, что не root,
    кладём в subcategories своего непосредственного родителя.
    """
    by_parent: dict[str | None, list[dict[str, Any]]] = {}
    for item in items:
        if not item.get("isActive", True):
            continue
        by_parent.setdefault(item.get("parentCategoryId"), []).append(item)

    tree: list[dict[str, Any]] = []
    for cat in by_parent.get(None, []):
        tree.append(
            {
                "id": cat["id"],
                "name": cat["name"],
                "description": cat.get("description") or "",
                "subcategories": [
                    {
                        "id": sub["id"],
                        "name": sub["name"],
                        "description": sub.get("description") or "",
                    }
                    for sub in by_parent.get(cat["id"], [])
                ],
            }
        )
    return tree


async def fetch_categories(url: str, timeout: float = 10.0) -> list[dict] | None:
    """GET endpoint, разворачиваем `items` в tree-формат matcher'а."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
        items = data.get("items")
        if not isinstance(items, list):
            logger.warning("Categories endpoint returned unexpected payload: %r", data)
            return None
        return _to_tree(items)
    except Exception as exc:
        logger.warning("Cannot fetch categories from %s: %s", url, exc)
        return None


def _fingerprint(raw: list[dict]) -> str:
    return json.dumps(raw, ensure_ascii=False, sort_keys=True)


async def load_categories_with_retry(
    url: str,
    on_update: Callable[[list[dict]], None],
    max_attempts: int = 20,
    delay: float = 3.0,
) -> str | None:
    """
    Стартовая загрузка с ретраями — сервис не должен начинать работу без категорий.
    Возвращает fingerprint загруженного payload'а (для передачи в poller, чтобы он
    не триггерил on_update на первом же тике), либо None если все попытки провалены.
    """
    for attempt in range(1, max_attempts + 1):
        raw = await fetch_categories(url)
        if raw is not None:
            on_update(raw)
            return _fingerprint(raw)
        logger.warning(
            "Categories load attempt %d/%d failed — retrying in %.1fs",
            attempt,
            max_attempts,
            delay,
        )
        await asyncio.sleep(delay)
    return None


async def poll_categories(
    url: str,
    on_update: Callable[[list[dict]], None],
    interval: float = 60.0,
    initial_fingerprint: str | None = None,
) -> None:
    """
    Раз в `interval` секунд переспрашивает categories endpoint.
    Вызывает on_update только если payload изменился — иначе матчер
    бесполезно пересчитывал бы эмбеддинги при каждом тике.
    """
    last_fingerprint = initial_fingerprint
    while True:
        try:
            await asyncio.sleep(interval)
            raw = await fetch_categories(url)
            if raw is None:
                continue
            fingerprint = _fingerprint(raw)
            if fingerprint == last_fingerprint:
                continue
            last_fingerprint = fingerprint
            on_update(raw)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Categories poll loop error: %s", exc)
