"""
Categories Service (mock) — отдаёт категории мединцидентов в формате
medincident-backend (proto query.incident.classifier.v1).

Эндпоинты:
  GET /v1/organizations/{organization_id}/incident-categories:patient-visible
      → {"items": [Category, ...]}
  GET /health

Маршрут и схема ответа повторяют:
  internal/handler/query/incident/classifier/query.go
    func (h *IncidentClassifierQueryHandler).ListPatientVisibleCategoriesByOrganization
  api/proto/query/incident/classifier/v1/classifier.proto

Фильтрация "только для пациентов" в backend инкапсулирована в endpoint
:patient-visible — поэтому mock тоже отдаёт сразу тот срез, который видит
пациент. Никаких флагов фильтра в самой модели категории нет.

Категории живут в `categories.py` иерархически (категория → подкатегории) —
это удобнее редактировать. Преобразование в плоский список с parentCategoryId
делаем на лету.
"""

import logging
import os
import sys
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI

from categories import CATEGORIES

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("categories-service")

# UUID реальной организации в backend; для mock'а — любой валидный UUID,
# чтобы фронт/клиент мог парсить как uuid.UUID.
ORG_ID = os.getenv("ORGANIZATION_ID", "00000000-0000-0000-0000-000000000001")
NOW = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000000000Z")

app = FastAPI(title="Categories Service (mock)", version="0.3.0")


def _flatten() -> list[dict[str, Any]]:
    """Иерархический CATEGORIES → flat-list под proto-схему."""
    out: list[dict[str, Any]] = []
    for cat in CATEGORIES:
        out.append(
            {
                "id": cat["id"],
                "organizationId": ORG_ID,
                "parentCategoryId": None,
                "name": cat["name"],
                "description": cat.get("description"),
                "isActive": True,
                "createdAt": NOW,
                "updatedAt": NOW,
            }
        )
        for sub in cat.get("subcategories", []):
            out.append(
                {
                    "id": sub["id"],
                    "organizationId": ORG_ID,
                    "parentCategoryId": cat["id"],
                    "name": sub["name"],
                    "description": sub.get("description"),
                    "isActive": True,
                    "createdAt": NOW,
                    "updatedAt": NOW,
                }
            )
    return out


_total_sub = sum(len(c["subcategories"]) for c in CATEGORIES)
logger.info(
    "Serving %d categories / %d subcategories under organization %s",
    len(CATEGORIES),
    _total_sub,
    ORG_ID,
)


@app.get("/v1/organizations/{organization_id}/incident-categories:patient-visible")
async def list_patient_visible_categories(
    organization_id: str,
    limit: int = 0,
    offset: int = 0,
) -> dict[str, list[dict[str, Any]]]:
    items = _flatten()
    if offset > 0:
        items = items[offset:]
    if limit > 0:
        items = items[:limit]
    return {"items": items}


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "categories": len(CATEGORIES)}
