#!/usr/bin/env python3
"""
export.py — упаковать nlp-service в zip без весов моделей.

Исключает:
  models_cache/    — скачанные HuggingFace модели (~370 MB)
  trained_models/  — fine-tuned веса (создаются после train_*.py)
  __pycache__/     — байткод Python
  .venv/           — виртуальное окружение

Результат: nlp-service_export.zip рядом с папкой сервиса.

Использование:
  python3 export.py
  python3 export.py --output /tmp/nlp-service.zip
"""

import argparse
import zipfile
from pathlib import Path

EXCLUDE_DIRS = {"models_cache", "trained_models", "__pycache__", ".venv"}
EXCLUDE_SUFFIXES = {".pyc", ".pyo"}

SERVICE_DIR = Path(__file__).parent
DEFAULT_OUTPUT = SERVICE_DIR.parent / "nlp-service_export.zip"


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    return path.suffix in EXCLUDE_SUFFIXES


def export(output: Path) -> None:
    files = [
        p for p in SERVICE_DIR.rglob("*")
        if p.is_file() and not should_exclude(p.relative_to(SERVICE_DIR))
    ]

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(files):
            arcname = Path("nlp-service") / file.relative_to(SERVICE_DIR)
            zf.write(file, arcname)
            print(f"  + {arcname}")

    size_mb = output.stat().st_size / 1024 / 1024
    print(f"\nГотово: {output}  ({size_mb:.1f} MB, {len(files)} файлов)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export nlp-service to zip without model weights")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Путь к zip-файлу")
    args = parser.parse_args()

    print(f"Упаковка {SERVICE_DIR} → {args.output}")
    print(f"Исключаем: {', '.join(sorted(EXCLUDE_DIRS))}\n")
    export(args.output)


if __name__ == "__main__":
    main()
