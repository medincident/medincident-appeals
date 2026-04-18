#!/usr/bin/env python3
"""
export.py — упаковать llm-service в zip.

Исключает:
  __pycache__/  — байткод Python
  .venv/        — виртуальное окружение

Веса Qwen2.5-3B хранятся в Ollama отдельно и в zip не включаются.

Результат: llm-service_export.zip рядом с папкой сервиса.

Использование:
  python3 export.py
  python3 export.py --output /tmp/llm-service.zip
"""

import argparse
import zipfile
from pathlib import Path

EXCLUDE_DIRS = {"__pycache__", ".venv"}
EXCLUDE_SUFFIXES = {".pyc", ".pyo"}

SERVICE_DIR = Path(__file__).parent
DEFAULT_OUTPUT = SERVICE_DIR.parent / "llm-service_export.zip"


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
            arcname = Path("llm-service") / file.relative_to(SERVICE_DIR)
            zf.write(file, arcname)
            print(f"  + {arcname}")

    size_mb = output.stat().st_size / 1024 / 1024
    print(f"\nГотово: {output}  ({size_mb:.1f} MB, {len(files)} файлов)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export llm-service to zip")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Путь к zip-файлу")
    args = parser.parse_args()

    print(f"Упаковка {SERVICE_DIR} → {args.output}")
    export(args.output)


if __name__ == "__main__":
    main()
