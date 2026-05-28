#!/usr/bin/env python3
"""Прогон N примеров из dataset.jsonl через LlmClient.

Тонкая обёртка над scripts/test_llm.py — единая точка входа в models/.

  uv run python -m models.test
  uv run python -m models.test --n 5
  uv run python -m models.test --not-important
  uv run python -m models.test --url http://localhost:11434
"""

from __future__ import annotations

import sys
from pathlib import Path

# scripts/ не пакет — добавляем в sys.path, чтобы импортировать test_llm.
_SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from test_llm import main  # noqa: E402

if __name__ == "__main__":
    main()
