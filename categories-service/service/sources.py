from __future__ import annotations

import logging
from typing import Protocol
from urllib.parse import quote

import httpx

from .config import Config
from .token import ServiceTokenProvider
from .tree import build_tree

logger = logging.getLogger(__name__)

PAGE_LIMIT = 500

# gateway HTTP/JSON: camelCase protojson, курсорная пагинация.
CATEGORIES_PATH = "/v1/organizations/{org}/incident-categories:all"
TYPES_PATH = "/v1/organizations/{org}/incident-types"


class CategorySource(Protocol):
    async def get_categories(self) -> list[dict]: ...


class StubCategorySource:
    """Отдаёт зашитые мок-категории (mock_categories.CATEGORIES)."""

    def __init__(self, module_name: str = "mock_categories", attr_name: str = "CATEGORIES") -> None:
        self.module_name = module_name
        self.attr_name = attr_name

    async def get_categories(self) -> list[dict]:
        import importlib

        module = importlib.import_module(self.module_name)
        return list(getattr(module, self.attr_name))


class BackendCategorySource:
    """Тянет patient-видимые категории+типы из medincident-backend напрямую
    через httpx (gateway HTTP/JSON) и собирает дерево category→subcategories.

    Эндпоинты — incident-categories:all (ListCategoriesByOrganization) и
    incident-types (ListTypesByOrganization). backend сам отдаёт пациенту
    только patient-видимое (фильтр по роли вызывающего); build_tree фильтрует
    повторно. Ответы — camelCase protojson, ровно та форма, что читает build_tree.

    transport — точка подмены для тестов (httpx.MockTransport); в проде None.
    """

    def __init__(
        self,
        base_url: str,
        org_id: str,
        token_provider: ServiceTokenProvider,
        request_timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.org_id = org_id
        self.token_provider = token_provider
        self.request_timeout = request_timeout
        self._transport = transport

    async def get_categories(self) -> list[dict]:
        token = await self.token_provider.get_token()
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=self.request_timeout,
            transport=self._transport,
        ) as client:
            categories = await self._fetch_all(client, CATEGORIES_PATH)
            types = await self._fetch_all(client, TYPES_PATH)
        return build_tree(categories, types)

    async def _fetch_all(self, client: httpx.AsyncClient, path_template: str) -> list[dict]:
        path = path_template.format(org=quote(self.org_id, safe=""))
        items: list[dict] = []
        after: str | None = None
        while True:
            params: dict[str, object] = {"limit": PAGE_LIMIT}
            if after:
                params["after"] = after
            resp = await client.get(path, params=params)
            resp.raise_for_status()
            data = resp.json()
            items.extend(data.get("items") or [])
            after = data.get("nextCursor")
            if not after:
                break
        return items


def build_source(cfg: Config) -> CategorySource:
    if cfg.use_stub:
        logger.info("Category source: stub (mock_categories)")
        return StubCategorySource()
    logger.info("Category source: backend (%s, org=%s)", cfg.medincident_url, cfg.org_id)
    token_provider = ServiceTokenProvider(
        issuer=cfg.zitadel_issuer,
        machine_key_path=cfg.machine_key_path,
        project_id=cfg.project_id,
        request_timeout=cfg.request_timeout,
    )
    return BackendCategorySource(
        base_url=cfg.medincident_url,
        org_id=cfg.org_id,
        token_provider=token_provider,
        request_timeout=cfg.request_timeout,
    )
