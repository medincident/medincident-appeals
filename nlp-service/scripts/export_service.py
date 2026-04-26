#!/usr/bin/env python3
"""Упаковка nlp-service + генератора датасета в zip без весов/кэшей/venv.

Содержимое архива:
    nlp-service/         — код сервиса (без models_cache/, trained_models/, .venv/)
    dataset/             — пакет-генератор (шаблоны, аугментеры, splitter)
    dataset.jsonl        — готовый датасет (3000 примеров)
    dataset.meta.json    — метаданные (seed, баланс классов, template_ids)
    generate_dataset.py  — entrypoint для регенерации датасета
"""

import argparse
import zipfile
from pathlib import Path

# Скрипт должен запускаться из любой директории без `uv sync` — считаем пути
# относительно себя, а не импортируем из paths.py.
SERVICE_DIR: Path = Path(__file__).resolve().parent.parent
ROOT_DIR: Path = SERVICE_DIR.parent

EXCLUDE_DIRS = {
    "models_cache",
    "trained_models",
    "__pycache__",
    ".venv",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
}
EXCLUDE_SUFFIXES = {".pyc", ".pyo"}
EXCLUDE_FILES = {"uv.lock"}

DEFAULT_OUTPUT = ROOT_DIR / "nlp-service_export.zip"

DATASET_DIR = ROOT_DIR / "dataset"
EXTRA_FILES = [
    ROOT_DIR / "dataset.jsonl",
    ROOT_DIR / "dataset.meta.json",
    ROOT_DIR / "generate_dataset.py",
]
# (source_path, arcname) — файлы с кастомным путём в архиве.
# categories.py кладём в корень nlp-service/, чтобы пакет был самодостаточным
# (без зависимости от соседней categories-service/).
EXTRA_PLACED_FILES: list[tuple[Path, Path]] = [
    (ROOT_DIR / "categories-service-mock" / "categories.py", Path("nlp-service/categories.py")),
]


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    if path.suffix in EXCLUDE_SUFFIXES:
        return True
    return path.name in EXCLUDE_FILES


def iter_tree(root: Path, arc_prefix: str) -> list[tuple[Path, Path]]:
    """Returns list of (absolute_path, arcname) for every file under root."""
    pairs: list[tuple[Path, Path]] = []
    for file in root.rglob("*"):
        if not file.is_file():
            continue
        rel = file.relative_to(root)
        if should_exclude(rel):
            continue
        pairs.append((file, Path(arc_prefix) / rel))
    return pairs


def export(output: Path) -> None:
    pairs: list[tuple[Path, Path]] = []

    pairs.extend(iter_tree(SERVICE_DIR, "nlp-service"))

    if DATASET_DIR.is_dir():
        pairs.extend(iter_tree(DATASET_DIR, "dataset"))
    else:
        print(f"  ! пропуск: {DATASET_DIR} не найдена")

    for extra in EXTRA_FILES:
        if extra.is_file():
            pairs.append((extra, Path(extra.name)))
        else:
            print(f"  ! пропуск: {extra} не найден")

    for src, arcname in EXTRA_PLACED_FILES:
        if src.is_file():
            pairs.append((src, arcname))
        else:
            print(f"  ! пропуск: {src} не найден")

    pairs.sort(key=lambda p: p[1])

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file, arcname in pairs:
            zf.write(file, arcname)
            print(f"  + {arcname}")

    size_mb = output.stat().st_size / 1024 / 1024
    print(f"\nГотово: {output}  ({size_mb:.1f} MB, {len(pairs)} файлов)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export nlp-service + dataset generator to zip without model weights"
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    print(f"Упаковка → {args.output}")
    print(f"  nlp-service: {SERVICE_DIR}")
    print(f"  dataset/:    {DATASET_DIR}")
    print(f"  extras:      {', '.join(p.name for p in EXTRA_FILES)}")
    print(f"Исключаем:     {', '.join(sorted(EXCLUDE_DIRS))}\n")
    export(args.output)


if __name__ == "__main__":
    main()
