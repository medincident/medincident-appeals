#!/usr/bin/env python3
"""Упаковка кода nlp-service в zip без весов/кэшей/venv — для передачи архивом."""

import argparse
import zipfile
from pathlib import Path

from paths import ROOT_DIR, SERVICE_DIR

EXCLUDE_DIRS = {"models_cache", "trained_models", "__pycache__", ".venv", ".pytest_cache"}
EXCLUDE_SUFFIXES = {".pyc", ".pyo"}

DEFAULT_OUTPUT = ROOT_DIR / "nlp-service_export.zip"


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    return path.suffix in EXCLUDE_SUFFIXES


def export(output: Path) -> None:
    files = [
        p
        for p in SERVICE_DIR.rglob("*")
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
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    print(f"Упаковка {SERVICE_DIR} → {args.output}")
    print(f"Исключаем: {', '.join(sorted(EXCLUDE_DIRS))}\n")
    export(args.output)


if __name__ == "__main__":
    main()
