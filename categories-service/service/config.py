from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    nats_url: str
    kv_bucket: str
    kv_key: str

    use_stub: bool
    poll_seconds: float

    # backend-режим (use_stub=false)
    medincident_url: str
    org_id: str

    # JWT-Bearer service token
    zitadel_issuer: str
    machine_key_path: str
    project_id: str

    request_timeout: float


def _bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def load_config() -> Config:
    return Config(
        nats_url=os.getenv("NATS_URL", "nats://nats:4222"),
        kv_bucket=os.getenv("CATEGORIES_NATS_BUCKET", "medincident"),
        kv_key=os.getenv("CATEGORIES_NATS_KEY", "categories"),
        use_stub=_bool(os.getenv("CATEGORIES_USE_STUB"), default=True),
        poll_seconds=float(os.getenv("CATEGORIES_POLL_SECONDS", "300")),
        medincident_url=os.getenv("MEDINCIDENT_SERVER_URL", ""),
        org_id=os.getenv("CATEGORIES_ORG_ID", ""),
        zitadel_issuer=os.getenv("ZITADEL_ISSUER", ""),
        machine_key_path=os.getenv("CATEGORIES_MACHINE_KEY_PATH", ""),
        project_id=os.getenv("CATEGORIES_PROJECT_ID", ""),
        request_timeout=float(os.getenv("CATEGORIES_HTTP_TIMEOUT", "10")),
    )
