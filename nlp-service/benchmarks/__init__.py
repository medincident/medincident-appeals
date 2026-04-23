"""
benchmarks — per-model бенчмарки и общие хелперы.

Модули:
  classifier_bench.py  — accuracy / F1 / precision / recall
  seq2seq_bench.py     — ROUGE-1/2/L для formalize + theses
  similarity_bench.py  — top-1 category / subcategory accuracy
  benchmark.py         — раннер всех трёх

Общий код (прямо в этом __init__.py):
  load_test_set()           — hold-out test split из dataset.jsonl
  measure_model_disk_size() — размер HF-модели в models_cache/
  measure_process_memory()  — RSS процесса (CPU) / GPU allocated (CUDA)
  percentile()              — p50/p95 и т.д.
  write_result()            — пишет .txt в benchmarks/results/
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from models import load_examples, split_by_templates
from paths import BENCHMARK_RESULTS_DIR, CACHE_DIR, DATASET_PATH


@dataclass
class TestItem:
    text: str
    label: int  # 1 если is_important, иначе 0
    answer: dict  # распарсенный assistant JSON
    template_id: str


def load_test_set(limit: int | None = None) -> list[TestItem]:
    """Hold-out test split из dataset.jsonl. Seed=42 — согласован с train-скриптами."""
    examples = load_examples(DATASET_PATH)
    template_ids = [ex.template_id for ex in examples]
    _, _, test_idx = split_by_templates(template_ids)

    items = [
        TestItem(
            text=examples[i].text,
            label=1 if examples[i].answer["is_important"] else 0,
            answer=examples[i].answer,
            template_id=examples[i].template_id,
        )
        for i in test_idx
    ]

    if limit:
        items = items[:limit]
    return items


def measure_model_disk_size(model_name: str) -> int:
    model_dir = CACHE_DIR / f"models--{model_name.replace('/', '--')}"
    if not model_dir.exists():
        return 0
    return sum(
        f.stat().st_size for f in model_dir.rglob("*") if f.is_file() and not f.name.startswith(".")
    )


def measure_process_memory() -> dict[str, float]:
    """GPU allocated MB при CUDA, иначе RSS процесса в MB."""
    import torch

    if torch.cuda.is_available():
        return {
            "gpu_allocated_mb": torch.cuda.memory_allocated() / 1024 / 1024,
            "gpu_max_allocated_mb": torch.cuda.max_memory_allocated() / 1024 / 1024,
        }
    try:
        import resource

        rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return {"process_rss_mb": rss_kb / 1024}
    except Exception:
        return {"process_rss_mb": 0.0}


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = min(int(len(sorted_vals) * p), len(sorted_vals) - 1)
    return sorted_vals[idx]


def result_path(model_name: str, finetuned: bool) -> Path:
    suffix = "trained" if finetuned else "untrained"
    BENCHMARK_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    return BENCHMARK_RESULTS_DIR / f"{model_name}_{suffix}.txt"


def write_result(model_name: str, finetuned: bool, content: str) -> Path:
    path = result_path(model_name, finetuned)
    path.write_text(content, encoding="utf-8")
    return path


__all__ = [
    "TestItem",
    "load_test_set",
    "measure_model_disk_size",
    "measure_process_memory",
    "percentile",
    "result_path",
    "write_result",
]
