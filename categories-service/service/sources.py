from __future__ import annotations

import logging
from typing import Protocol

from generated.backend import AuthenticatedClient
from generated.backend.api.incident_classifier_query import (
    incident_classifier_query_list_types_by_organization as types_api,
)
from generated.backend.api.incident_classifier_query import (
    incident_classifier_query_list_categories_by_organization as categories_api,
)
from generated.backend.types import UNSET

from .config import Config
from .token import ServiceTokenProvider
from .tree import build_tree

logger = logging.getLogger(__name__)

PAGE_LIMIT = 500


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
    """Тянет patient-видимые категории+типы из medincident-backend через
    сгенерированный OpenAPI-клиент и собирает дерево category→subcategories.

    Эндпоинты:
      incident-categories:all (ListCategoriesByOrganization),
      incident-types (ListTypesByOrganization) — backend сам отдаёт пациенту
      только patient-видимое (фильтр по роли вызывающего); build_tree фильтрует
      повторно.
    """

    def __init__(
        self,
        base_url: str,
        org_id: str,
        token_provider: ServiceTokenProvider,
        request_timeout: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.org_id = org_id
        self.token_provider = token_provider
        self.request_timeout = request_timeout

    async def get_categories(self) -> list[dict]:
        token = await self.token_provider.get_token()
        client = AuthenticatedClient(
            base_url=self.base_url,
            token=token,
            timeout=self.request_timeout,
            raise_on_unexpected_status=True,
        )
        async with client:
            categories = await self._fetch_all(client, categories_api)
            types = await self._fetch_all(client, types_api)
        return build_tree(categories, types)

    async def _fetch_all(self, client: AuthenticatedClient, api_module) -> list[dict]:
        items: list[dict] = []
        after: str | None = None
        while True:
            resp = await api_module.asyncio(
                organization_id=self.org_id,
                client=client,
                limit=PAGE_LIMIT,
                after=after if after else UNSET,
            )
            page = getattr(resp, "items", None) or []
            items.extend(item.to_dict() for item in page)
            next_cursor = getattr(resp, "next_cursor", UNSET)
            if not next_cursor or next_cursor is UNSET:
                break
            after = next_cursor
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
