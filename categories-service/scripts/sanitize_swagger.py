#!/usr/bin/env python3
"""Санитизация swagger перед генерацией клиента (как dreyn_frontend codegen.mjs).

Убирает суффикс `Service` из имён тегов и из префикса operationId — иначе
grpc-gateway-овские теги вида `XxxQueryService` дают классы/модули с лишним
`Service` в имени. Читает swagger из argv[1], пишет результат в argv[2].
"""

from __future__ import annotations

import json
import sys


def strip_service(name: object) -> object:
    if isinstance(name, str) and name.endswith("Service") and name != "Service":
        return name[: -len("Service")]
    return name


def strip_service_from_op_id(op_id: object) -> object:
    if not isinstance(op_id, str):
        return op_id
    i = op_id.find("_")
    if i < 0:
        return op_id
    return str(strip_service(op_id[:i])) + op_id[i:]


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        swagger = json.load(f)

    if isinstance(swagger.get("tags"), list):
        swagger["tags"] = [{**t, "name": strip_service(t.get("name"))} for t in swagger["tags"]]

    for path in (swagger.get("paths") or {}).values():
        for method in path.values():
            if not isinstance(method, dict):
                continue
            if isinstance(method.get("tags"), list):
                method["tags"] = [strip_service(t) for t in method["tags"]]
            if method.get("operationId"):
                method["operationId"] = strip_service_from_op_id(method["operationId"])

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(swagger, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
