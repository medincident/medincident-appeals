"""Prometheus-метрики: стандартные HTTP (через instrumentator) + кастомные пайплайна."""

from __future__ import annotations

from prometheus_client import Counter, Histogram
from prometheus_fastapi_instrumentator import Instrumentator

pipeline_requests_total = Counter(
    "nlp_pipeline_requests_total",
    "Запросы /analyze по исходу: important | not_important | error.",
    labelnames=("outcome",),
)

pipeline_duration_seconds = Histogram(
    "nlp_pipeline_duration_seconds",
    "Длительность полного пайплайна /analyze.",
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

classifier_predictions_total = Counter(
    "nlp_classifier_predictions_total",
    "Предсказания ImportanceClassifier по меткам.",
    labelnames=("label",),
)


def instrument_app(app) -> None:
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
