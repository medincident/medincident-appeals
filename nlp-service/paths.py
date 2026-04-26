"""Константы путей внутри nlp-service. Проект установлен editable
(локально) либо в PYTHONPATH (Docker) — `from paths import ...` работает
из любой директории."""

from __future__ import annotations

import sys
from pathlib import Path

SERVICE_DIR: Path = Path(__file__).resolve().parent
ROOT_DIR: Path = SERVICE_DIR.parent

CACHE_DIR: Path = SERVICE_DIR / "models_cache"
TRAINED_DIR: Path = SERVICE_DIR / "trained_models"
TRAINED_CLASSIFIER_DIR: Path = TRAINED_DIR / "classifier"
TRAINED_SEQ2SEQ_DIR: Path = TRAINED_DIR / "seq2seq"

DATASET_PATH: Path = ROOT_DIR / "dataset.jsonl"
CATEGORIES_SERVICE_DIR: Path = ROOT_DIR / "categories-service-mock"

BENCHMARKS_DIR: Path = SERVICE_DIR / "benchmarks"
BENCHMARK_RESULTS_DIR: Path = BENCHMARKS_DIR / "results"


def ensure_categories_service_on_path() -> None:
    """categories-service — соседний пакет, не входит в nlp-service-install,
    поэтому добавляем его путь в sys.path вручную перед `import categories`."""
    path_str = str(CATEGORIES_SERVICE_DIR)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)
