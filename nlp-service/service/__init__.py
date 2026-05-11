"""Оркестрация пайплайна + инфраструктура (NATS, HTTP-категории, logging, metrics)."""

from .analyze_handler import subscribe_analyze
from .categories_client import (
    fetch_categories,
    load_categories_with_retry,
    poll_categories,
)
from .logging_setup import setup_logging
from .metrics import (
    classifier_predictions_total,
    instrument_app,
    pipeline_duration_seconds,
    pipeline_requests_total,
)
from .nats_client import connect_with_retry
from .pipeline import build_reason, run_pipeline

__all__ = [
    "build_reason",
    "classifier_predictions_total",
    "connect_with_retry",
    "fetch_categories",
    "instrument_app",
    "load_categories_with_retry",
    "pipeline_duration_seconds",
    "pipeline_requests_total",
    "poll_categories",
    "run_pipeline",
    "setup_logging",
    "subscribe_analyze",
]
