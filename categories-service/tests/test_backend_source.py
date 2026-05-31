import pytest

from generated.backend.models.classifier_v1_type import ClassifierV1Type
from generated.backend.models.v1_category import V1Category
from generated.backend.models.v1_list_categories_by_organization_response import (
    V1ListCategoriesByOrganizationResponse,
)
from generated.backend.models.v1_list_types_by_organization_response import (
    V1ListTypesByOrganizationResponse,
)
from service import sources
from service.sources import BackendCategorySource


class FakeTokenProvider:
    async def get_token(self):
        return "tok"


def _cat(cid, active=True):
    return V1Category(id=cid, name=f"C-{cid}", description=f"d-{cid}", is_active=active)


def _type(tid, cid, patient, active=True):
    return ClassifierV1Type(
        id=tid, category_id=cid, name=f"T-{tid}", description="td",
        is_active=active, is_allowed_for_patients=patient,
    )


def _patch_apis(monkeypatch, cat_pages, type_pages):
    """cat_pages/type_pages — списки (items, next_cursor) по страницам."""
    cat_iter = iter(cat_pages)
    type_iter = iter(type_pages)

    async def fake_cat_asyncio(*, organization_id, client, limit, after, **kwargs):
        items, nxt = next(cat_iter)
        return V1ListCategoriesByOrganizationResponse(items=items, next_cursor=nxt)

    async def fake_type_asyncio(*, organization_id, client, limit, after, **kwargs):
        items, nxt = next(type_iter)
        return V1ListTypesByOrganizationResponse(items=items, next_cursor=nxt)

    monkeypatch.setattr(sources.categories_api, "asyncio", fake_cat_asyncio)
    monkeypatch.setattr(sources.types_api, "asyncio", fake_type_asyncio)


@pytest.mark.asyncio
async def test_assembles_patient_tree(monkeypatch):
    from generated.backend.types import UNSET

    _patch_apis(
        monkeypatch,
        cat_pages=[([_cat("c1")], UNSET)],
        type_pages=[([_type("t1", "c1", True), _type("t2", "c1", False)], UNSET)],
    )
    src = BackendCategorySource("http://gw", "org-1", FakeTokenProvider())

    tree = await src.get_categories()

    assert len(tree) == 1
    assert tree[0]["id"] == "c1"
    # t2 не patient-allowed → отфильтрован build_tree
    assert [s["id"] for s in tree[0]["subcategories"]] == ["t1"]


@pytest.mark.asyncio
async def test_follows_pagination(monkeypatch):
    from generated.backend.types import UNSET

    _patch_apis(
        monkeypatch,
        cat_pages=[([_cat("c1")], "cur1"), ([_cat("c2")], UNSET)],
        type_pages=[([_type("t1", "c1", True), _type("t2", "c2", True)], UNSET)],
    )
    src = BackendCategorySource("http://gw", "org-1", FakeTokenProvider())

    tree = await src.get_categories()

    assert {c["id"] for c in tree} == {"c1", "c2"}
