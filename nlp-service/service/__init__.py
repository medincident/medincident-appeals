"""Оркестрация пайплайна + инфраструктура (NATS, logging, metrics)."""

from .analyze_handler import subscribe_analyze
from .logging_setup import setup_logging
from .metrics import (
    classifier_predictions_total,
    instrument_app,
    pipeline_duration_seconds,
    pipeline_requests_total,
)
from .nats_client import connect_with_retry, load_categories, watch_categories
from .pipeline import build_reason, run_pipeline

__all__ = [
    "build_reason",
    "classifier_predictions_total",
    "connect_with_retry",
    "instrument_app",
    "load_categories",
    "pipeline_duration_seconds",
    "pipeline_requests_total",
    "run_pipeline",
    "setup_logging",
    "subscribe_analyze",
    "watch_categories",
]
