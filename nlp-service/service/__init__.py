"""Оркестрация пайплайна + инфраструктура (NATS, logging, metrics)."""

from .analyze_handler import subscribe_analyze
from .categories import CategoryCache, CategorySource, build_source
from .logging_setup import setup_logging
from .metrics import (
    classifier_predictions_total,
    instrument_app,
    pipeline_duration_seconds,
    pipeline_requests_total,
)
from .nats_client import connect_with_retry
from .pipeline import run_pipeline

__all__ = [
    "CategoryCache",
    "CategorySource",
    "build_source",
    "classifier_predictions_total",
    "connect_with_retry",
    "instrument_app",
    "pipeline_duration_seconds",
    "pipeline_requests_total",
    "run_pipeline",
    "setup_logging",
    "subscribe_analyze",
]
