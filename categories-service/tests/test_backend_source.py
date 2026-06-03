import httpx
import pytest

from service.sources import BackendCategorySource


class FakeTokenProvider:
    async def get_token(self):
        return "tok"


def _cat(cid, active=True):
    return {"id": cid, "name": f"C-{cid}", "description": f"d-{cid}", "isActive": active}


def _type(tid, cid, patient, active=True):
    return {
        "id": tid,
        "categoryId": cid,
        "name": f"T-{tid}",
        "description": "td",
        "isActive": active,
        "isAllowedForPatients": patient,
    }


def _make_transport(cat_pages, type_pages):
    """cat_pages/type_pages — списки (items, next_cursor) по страницам.
    Курсор None означает последнюю страницу."""
    cat_iter = iter(cat_pages)
    type_iter = iter(type_pages)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("Authorization") == "Bearer tok"
        if "incident-categories" in request.url.path:
            items, nxt = next(cat_iter)
        elif "incident-types" in request.url.path:
            items, nxt = next(type_iter)
        else:  # pragma: no cover
            return httpx.Response(404)
        body: dict = {"items": items}
        if nxt:
            body["nextCursor"] = nxt
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_assembles_patient_tree():
    transport = _make_transport(
        cat_pages=[([_cat("c1")], None)],
        type_pages=[([_type("t1", "c1", True), _type("t2", "c1", False)], None)],
    )
    src = BackendCategorySource("http://gw", "org-1", FakeTokenProvider(), transport=transport)

    tree = await src.get_categories()

    assert len(tree) == 1
    assert tree[0]["id"] == "c1"
    # t2 не patient-allowed → отфильтрован build_tree
    assert [s["id"] for s in tree[0]["subcategories"]] == ["t1"]


@pytest.mark.asyncio
async def test_follows_pagination():
    transport = _make_transport(
        cat_pages=[([_cat("c1")], "cur1"), ([_cat("c2")], None)],
        type_pages=[([_type("t1", "c1", True), _type("t2", "c2", True)], None)],
    )
    src = BackendCategorySource("http://gw", "org-1", FakeTokenProvider(), transport=transport)

    tree = await src.get_categories()

    assert {c["id"] for c in tree} == {"c1", "c2"}
