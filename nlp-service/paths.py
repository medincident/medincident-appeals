"""Константы путей внутри nlp-service. Проект установлен editable
(локально) либо в PYTHONPATH (Docker) — `from paths import ...` работает
из любой директории."""

from __future__ import annotations

from pathlib import Path

SERVICE_DIR: Path = Path(__file__).resolve().parent
ROOT_DIR: Path = SERVICE_DIR.parent

CACHE_DIR: Path = SERVICE_DIR / "models_cache"
TRAINED_DIR: Path = SERVICE_DIR / "trained_models"
TRAINED_CLASSIFIER_DIR: Path = TRAINED_DIR / "classifier"
TRAINED_SEQ2SEQ_DIR: Path = TRAINED_DIR / "seq2seq"

DATASET_PATH: Path = ROOT_DIR / "dataset.jsonl"

BENCHMARKS_DIR: Path = SERVICE_DIR / "benchmarks"
BENCHMARK_RESULTS_DIR: Path = BENCHMARKS_DIR / "results"
