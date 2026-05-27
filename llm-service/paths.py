"""Константы путей внутри llm-service."""

from __future__ import annotations

from pathlib import Path

SERVICE_DIR: Path = Path(__file__).resolve().parent
ROOT_DIR: Path = SERVICE_DIR.parent

DATASET_PATH: Path = ROOT_DIR / "dataset.jsonl"

MODELS_DIR: Path = SERVICE_DIR / "models"
MODELS_CACHE_DIR: Path = SERVICE_DIR / "models_cache"
