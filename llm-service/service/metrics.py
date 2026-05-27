"""Prometheus-метрики llm-service: HTTP через instrumentator + кастомные пайплайна."""

from __future__ import annotations

from prometheus_client import Counter, Histogram
from prometheus_fastapi_instrumentator import Instrumentator

pipeline_requests_total = Counter(
    "llm_pipeline_requests_total",
    "Запросы /analyze + NATS llm.analyze по исходу: important | not_important | error.",
    labelnames=("outcome",),
)

pipeline_duration_seconds = Histogram(
    "llm_pipeline_duration_seconds",
    "Длительность полного пайплайна llm /analyze.",
    buckets=(1.0, 2.5, 5.0, 10.0, 20.0, 40.0, 60.0, 120.0, 180.0),
)


def instrument_app(app) -> None:
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
