#!/usr/bin/env python3
"""Прогон LLM (qwen3-4b GGUF через llama-cpp-python) на одном тексте.

  uv run python -m models.llm.run -m "упал с кровати"
  uv run python -m models.llm.run -i
  echo "первый текст" | uv run python -m models.llm.run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

from mock_categories import CATEGORIES
from models.llm import LlamaCppClient
from models.llm.load import DEFAULT_QUANT, DEFAULT_REPO, resolve_model_path
from service.pipeline import run_analyze


async def print_result(client: LlamaCppClient, categories: list[dict], text: str) -> None:
    text = text.strip()
    if not text:
        return
    result = await run_analyze(client, text, categories)
    print("─" * 70)
    print(f"INPUT:  {text}")
    print(f"RESULT: {json.dumps(result, ensure_ascii=False, indent=2)}")
    print()


async def amain() -> None:
    parser = argparse.ArgumentParser(description="Run LLM (qwen3-4b GGUF) on input text")
    parser.add_argument("-m", "--message", type=str, default=None)
    parser.add_argument("-i", "--interactive", action="store_true")
    parser.add_argument("--repo", default=os.getenv("LLM_REPO", DEFAULT_REPO))
    parser.add_argument("--quant", default=os.getenv("LLM_QUANT", DEFAULT_QUANT))
    parser.add_argument("--n-gpu-layers", type=int, default=int(os.getenv("LLM_N_GPU_LAYERS", "0")))
    args = parser.parse_args()

    gguf = resolve_model_path(args.repo, args.quant)
    print(f"LLM: {gguf}", flush=True)
    client = LlamaCppClient(model_path=gguf, n_gpu_layers=args.n_gpu_layers)

    try:
        if args.interactive:
            print("Введите текст (Ctrl+D / Ctrl+Z для выхода):", flush=True)
            for line in sys.stdin:
                await print_result(client, CATEGORIES, line)
            return

        if args.message:
            await print_result(client, CATEGORIES, args.message)
            return

        if not sys.stdin.isatty():
            for line in sys.stdin:
                await print_result(client, CATEGORIES, line)
            return

        parser.error("Передайте -m / -i или направьте текст в stdin")
    finally:
        client.close()


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
