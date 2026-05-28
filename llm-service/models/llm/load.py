#!/usr/bin/env python3
"""Скачивает GGUF-веса базовой LLM с HuggingFace в `models_cache/gguf/`.

Источник: `unsloth/Qwen3-4B-GGUF` — официальный квантованный релиз
от Unsloth. По умолчанию тянем Q4_K_M (~2.5 GB) — лучший компромисс
качество/размер на CPU, эквивалент `qwen3:4b` в Ollama.

  uv run python -m models.llm.load
  uv run python -m models.llm.load --quant Q5_K_M
  uv run python -m models.llm.load --repo unsloth/Qwen3-4B-GGUF --quant Q4_K_M
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from paths import MODELS_CACHE_DIR

logger = logging.getLogger(__name__)

DEFAULT_REPO = "unsloth/Qwen3-4B-GGUF"
DEFAULT_QUANT = "Q4_K_M"


def gguf_filename(repo: str, quant: str) -> str:
    """Имя файла по соглашению unsloth/bartowski: `<ModelName>-<quant>.gguf`."""
    model_name = repo.split("/")[-1].removesuffix("-GGUF")
    return f"{model_name}-{quant}.gguf"


def model_path(repo: str = DEFAULT_REPO, quant: str = DEFAULT_QUANT) -> Path:
    """Куда складывается файл — используется и в load.py, и в model.py."""
    return MODELS_CACHE_DIR / "gguf" / gguf_filename(repo, quant)


def resolve_model_path(repo: str = DEFAULT_REPO, quant: str = DEFAULT_QUANT) -> Path:
    """Подбирает GGUF в models_cache/gguf/ при старте сервиса.

    1. Точное совпадение по repo+quant (`<ModelName>-<quant>.gguf`).
    2. Иначе — warning и поиск файла с `Default` в имени (при нескольких — первый
       по алфавиту, тоже с warning).
    3. Если ничего нет — FileNotFoundError (вызывающий завершает сервис).
    """
    target = model_path(repo, quant)
    if target.exists():
        return target

    gguf_dir = target.parent
    logger.warning(
        "Модель по LLM_REPO=%s LLM_QUANT=%s не найдена (%s) — ищу fallback с 'Default' в имени",
        repo, quant, target,
    )

    candidates = sorted(p for p in gguf_dir.glob("*.gguf") if "Default" in p.name)
    if candidates:
        chosen = candidates[0]
        if len(candidates) > 1:
            logger.warning(
                "Найдено несколько 'Default' GGUF (%s) — беру первый: %s",
                ", ".join(p.name for p in candidates), chosen.name,
            )
        else:
            logger.warning("Использую fallback-модель: %s", chosen)
        return chosen

    raise FileNotFoundError(
        f"GGUF не найден: ни {target.name}, ни файла с 'Default' в имени в {gguf_dir}"
    )


def download(repo: str, quant: str) -> Path:
    from huggingface_hub import hf_hub_download

    target = model_path(repo, quant)
    target.parent.mkdir(parents=True, exist_ok=True)

    if target.exists():
        print(f"[skip] уже есть: {target} ({target.stat().st_size / 1e9:.2f} GB)")
        return target

    filename = gguf_filename(repo, quant)
    print(f"[hf] {repo} :: {filename} → {target.parent}")
    downloaded = hf_hub_download(
        repo_id=repo,
        filename=filename,
        local_dir=str(target.parent),
    )
    print(f"[ok] {downloaded}")
    return Path(downloaded)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download GGUF model from HuggingFace")
    parser.add_argument("--repo", default=DEFAULT_REPO, help=f"HF repo (default: {DEFAULT_REPO})")
    parser.add_argument("--quant", default=DEFAULT_QUANT, help=f"Quant (default: {DEFAULT_QUANT})")
    args = parser.parse_args()
    try:
        download(args.repo, args.quant)
    except Exception as exc:
        sys.exit(f"download failed: {exc}")


if __name__ == "__main__":
    main()
