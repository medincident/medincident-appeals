from __future__ import annotations


def build_tree(categories: list[dict], types: list[dict]) -> list[dict]:
    """Собирает patient-видимое дерево из плоских ответов medincident-backend.

    Вход — camelCase-объекты Category и Type (как отдаёт gateway protojson).
    Выход — формат, который читают AI-сервисы из NATS KV:
        [{ "id", "name", "description", "subcategories": [{ "id", "name", "description" }] }]

    Тип = подкатегория. Оставляем только active + isAllowedForPatients=true;
    категории без оставшихся подкатегорий выкидываем.
    """
    subs_by_category: dict[str, list[dict]] = {}
    for t in types:
        if not t.get("isActive", False) or not t.get("isAllowedForPatients", False):
            continue
        category_id = t.get("categoryId")
        if not category_id:
            continue
        subs_by_category.setdefault(category_id, []).append(
            {
                "id": t["id"],
                "name": t["name"],
                # backend часто не отдаёт description у типов — фолбэк на name,
                # чтобы CategoryMatcher эмбеддил осмысленный текст, а не пустоту.
                "description": t.get("description") or t["name"],
            }
        )

    result: list[dict] = []
    for c in categories:
        if not c.get("isActive", False):
            continue
        subs = subs_by_category.get(c["id"])
        if not subs:
            continue
        result.append(
            {
                "id": c["id"],
                "name": c["name"],
                "description": c.get("description") or c["name"],
                "subcategories": subs,
            }
        )
    return result
