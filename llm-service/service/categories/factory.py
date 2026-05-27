from __future__ import annotations

import os

from .source import CategorySource


def build_source() -> CategorySource:
    kind = os.getenv("CATEGORIES_SOURCE", "nats").lower()
    if kind == "nats":
        from .nats import from_env
        return from_env()
    if kind == "http":
        from .http import from_env
        return from_env()
    if kind == "static":
        from .static import from_env
        return from_env()
    raise ValueError(f"Unknown CATEGORIES_SOURCE: {kind!r}")
