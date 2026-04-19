"""Структурированное JSON-логирование. ENV: LOG_LEVEL, LOG_FORMAT=json|plain."""

from __future__ import annotations

import logging
import os
import sys

from pythonjsonlogger.json import JsonFormatter


def setup_logging() -> None:
    """Вызывать один раз при старте приложения."""
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    fmt = os.getenv("LOG_FORMAT", "json").lower()

    handler = logging.StreamHandler(sys.stdout)

    if fmt == "plain":
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    else:
        handler.setFormatter(
            JsonFormatter(
                "{asctime}{levelname}{name}{message}",
                style="{",
                rename_fields={
                    "asctime": "timestamp",
                    "levelname": "level",
                    "name": "logger",
                },
            )
        )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
