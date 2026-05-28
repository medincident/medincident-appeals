#!/usr/bin/env python3
"""Бенчмарк qwen3:4b через LlmClient на test-split датасета.

Тонкая обёртка над benchmarks/llm_bench.py — единая точка входа в models/.

  uv run python -m models.bench
  uv run python -m models.bench --limit 50
  uv run python -m models.bench --limit 0   # все
  uv run python -m models.bench --url http://localhost:11434
"""

from __future__ import annotations

from benchmarks.llm_bench import main

if __name__ == "__main__":
    main()
