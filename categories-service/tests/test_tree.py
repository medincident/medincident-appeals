from service import build_tree


def _cat(cid, active=True):
    return {"id": cid, "name": f"name-{cid}", "description": f"d-{cid}", "isActive": active}


def _type(tid, cid, patient, active=True, description="td"):
    return {
        "id": tid,
        "categoryId": cid,
        "name": f"type-{tid}",
        "description": description,
        "isActive": active,
        "isAllowedForPatients": patient,
    }


def test_maps_categories_to_subcategories_via_types():
    cats = [_cat("c1"), _cat("c2")]
    types = [_type("t1", "c1", True), _type("t2", "c1", True), _type("t3", "c2", True)]

    tree = build_tree(cats, types)

    by_id = {c["id"]: c for c in tree}
    assert len(tree) == 2
    assert {s["id"] for s in by_id["c1"]["subcategories"]} == {"t1", "t2"}
    assert {s["id"] for s in by_id["c2"]["subcategories"]} == {"t3"}


def test_drops_types_not_allowed_for_patients():
    cats = [_cat("c1")]
    types = [_type("t1", "c1", True), _type("t2", "c1", False)]

    tree = build_tree(cats, types)

    assert [s["id"] for s in tree[0]["subcategories"]] == ["t1"]


def test_drops_category_with_no_patient_visible_types():
    cats = [_cat("c1"), _cat("c2")]
    types = [_type("t1", "c1", True), _type("t2", "c2", False)]

    tree = build_tree(cats, types)

    assert [c["id"] for c in tree] == ["c1"]


def test_drops_inactive_categories_and_types():
    cats = [_cat("c1"), _cat("c2", active=False)]
    types = [
        _type("t1", "c1", True),
        _type("t2", "c1", True, active=False),
        _type("t3", "c2", True),
    ]

    tree = build_tree(cats, types)

    assert [c["id"] for c in tree] == ["c1"]
    assert [s["id"] for s in tree[0]["subcategories"]] == ["t1"]


def test_missing_description_falls_back_to_name():
    cats = [{"id": "c1", "name": "C1", "isActive": True}]
    types = [_type("t1", "c1", True, description=None)]

    tree = build_tree(cats, types)

    # backend часто не отдаёт description — фолбэк на name (для эмбеддинга матчера)
    assert tree[0]["description"] == "C1"
    assert tree[0]["subcategories"][0]["description"] == "type-t1"


def test_empty_inputs_yield_empty_tree():
    assert build_tree([], []) == []
