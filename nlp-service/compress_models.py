#!/usr/bin/env python3
"""
compress_models.py — конвертирует trained_models в fp16 (~50% экономии места).

fp16 достаточно для инференса — потери качества минимальны.
Обучение всегда ведётся в fp32, поэтому это только для деплоя.

Использование:
  python3 compress_models.py            # конвертирует на месте
  python3 compress_models.py --dry-run  # только показывает размеры
"""

import argparse
import shutil
from pathlib import Path

TRAINED_DIR = Path(__file__).parent / "trained_models"
MODELS = ["classifier", "seq2seq"]


def dir_size_mb(path: Path) -> float:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) / 1024 / 1024


def compress(model_dir: Path, dry_run: bool) -> None:
    import torch
    from transformers import AutoModelForSequenceClassification, T5ForConditionalGeneration

    name = model_dir.name
    before_mb = dir_size_mb(model_dir)
    print(f"\n{name}: {before_mb:.1f} MB → ", end="", flush=True)

    if dry_run:
        print(f"~{before_mb/2:.1f} MB (оценка)")
        return

    if name == "classifier":
        model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    elif name == "seq2seq":
        model = T5ForConditionalGeneration.from_pretrained(model_dir)
    else:
        print("пропущено (неизвестный тип)")
        return

    model = model.half()  # fp32 → fp16
    model.save_pretrained(model_dir)

    after_mb = dir_size_mb(model_dir)
    print(f"{after_mb:.1f} MB  (сжатие {(1 - after_mb/before_mb)*100:.0f}%)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Конвертация trained_models в fp16")
    parser.add_argument("--dry-run", action="store_true", help="Только показать размеры")
    args = parser.parse_args()

    if not TRAINED_DIR.exists():
        print(f"Папка {TRAINED_DIR} не найдена — сначала обучи модели.")
        return

    total_before = dir_size_mb(TRAINED_DIR)
    print(f"trained_models: {total_before:.1f} MB")
    if args.dry_run:
        print("(dry-run — изменений не будет)")

    for name in MODELS:
        model_dir = TRAINED_DIR / name
        if not model_dir.exists():
            print(f"\n{name}: не найдено, пропускаем")
            continue
        compress(model_dir, args.dry_run)

    if not args.dry_run:
        total_after = dir_size_mb(TRAINED_DIR)
        print(f"\nИтого: {total_before:.1f} MB → {total_after:.1f} MB "
              f"(−{total_before - total_after:.1f} MB)")


if __name__ == "__main__":
    main()
