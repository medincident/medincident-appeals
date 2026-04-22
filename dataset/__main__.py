"""CLI точка входа пакета: `python3 -m dataset_gen`.

Использование также через shim: `python3 generate_dataset.py`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .generator import GenConfig, generate
from .metrics import length_stats, summarize, token_count_stats
from .splitter import SPLIT_TEST, SPLIT_TRAIN, SPLIT_VAL


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Генератор синтетического датасета жалоб пациентов.")
    p.add_argument("--target", type=int, default=3000, help="Сколько примеров сгенерировать.")
    p.add_argument("--seed", type=int, default=42, help="Сид ГПСЧ.")
    p.add_argument("--output", type=str, default="dataset.jsonl", help="Путь к выходному файлу.")
    p.add_argument(
        "--meta-output",
        type=str,
        default="dataset.meta.json",
        help="Куда писать метаданные (fix #15).",
    )
    p.add_argument(
        "--important-ratio",
        type=float,
        default=0.75,
        help="Доля important-примеров.",
    )
    return p.parse_args(argv)


def _print_summary(
    examples: list,
    meta: dict,
    out_path: str,
) -> None:
    total = len(examples)
    important_n = sum(1 for e in examples if e.is_important)
    not_important_n = total - important_n

    # по категориям
    cats: dict[str, int] = {}
    subs: dict[str, int] = {}
    for e in examples:
        key = e.cat_name or "-- не важно --"
        cats[key] = cats.get(key, 0) + 1
        if e.sub_id:
            subs[e.sub_id] = subs.get(e.sub_id, 0) + 1

    # по split
    by_split = {SPLIT_TRAIN: 0, SPLIT_VAL: 0, SPLIT_TEST: 0}
    for e in examples:
        by_split[e.split] = by_split.get(e.split, 0) + 1

    # метрики разнообразия (fix #14)
    user_texts = [e.user_text for e in examples]
    texts_by_template: dict[str, list[str]] = {}
    for e in examples:
        texts_by_template.setdefault(e.template_id, []).append(e.user_text)

    diversity = summarize(user_texts, texts_by_template)
    length = length_stats(user_texts)
    tokens = token_count_stats(user_texts)

    unique_user_texts = len(set(user_texts))
    unique_templates = len(texts_by_template)
    ambiguous_count = sum(1 for e in examples if e.ambiguous)
    clean_noisy_pairs = sum(1 for e in examples if e.clean_text is not None)

    print(f"Written {total} examples to {out_path}")
    print(f"  Version: {meta['version']}  |  Seed: {meta['seed']}  |  Hash: {meta['templates_hash']}")
    print(f"  Important: {important_n}  |  Not important: {not_important_n}")
    print(f"  Unique user texts: {unique_user_texts} / {total}")
    print(f"  Unique template_ids used: {unique_templates}")
    print(f"  Ambiguous flagged: {ambiguous_count}")
    print(f"  Noisy/clean pairs (for spell-check training): {clean_noisy_pairs}")
    print(f"  Split — train: {by_split[SPLIT_TRAIN]}  val: {by_split[SPLIT_VAL]}  test: {by_split[SPLIT_TEST]}")
    print(
        f"  Char length — min: {int(length['min'])}, "
        f"max: {int(length['max'])}, avg: {length['avg']:.0f}"
    )
    print(
        f"  Token count — min: {int(tokens['min'])}, "
        f"max: {int(tokens['max'])}, avg: {tokens['avg']:.1f}"
    )
    print("  Diversity:")
    print(f"    distinct-1: {diversity['distinct_1']:.3f}")
    print(f"    distinct-2: {diversity['distinct_2']:.3f}")
    print(f"    distinct-3: {diversity['distinct_3']:.3f}")
    print(f"    TTR:         {diversity['ttr']:.3f}")
    print(f"    intra-template Jaccard (ниже — разнообразнее): {diversity['intra_jaccard']:.3f}")

    print("  Distribution by category:")
    for k, v in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"    {v:4d}  {k}")

    print("  Distribution by subcategory:")
    for k, v in sorted(subs.items()):
        print(f"    {v:4d}  {k}")


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)

    cfg = GenConfig(
        target=args.target,
        seed=args.seed,
        important_ratio=args.important_ratio,
    )

    from . import DATASET_VERSION

    print(f"Generating dataset {DATASET_VERSION} "
          f"(target={cfg.target}, seed={cfg.seed})...")
    examples, meta = generate(cfg)

    out_path = Path(args.output)
    with out_path.open("w", encoding="utf-8") as f:
        f.write(json.dumps(meta, ensure_ascii=False) + "\n")
        for ex in examples:
            f.write(ex.to_jsonl_line() + "\n")

    # отдельный meta-файл для удобства
    Path(args.meta_output).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    _print_summary(examples, meta, str(out_path))


if __name__ == "__main__":
    main()
