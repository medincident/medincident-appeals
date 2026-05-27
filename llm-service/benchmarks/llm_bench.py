#!/usr/bin/env python3
"""Бенчмарк LLM (qwen3-4b GGUF) на test split датасета — напрямую через LlamaCppClient.

  uv run python benchmarks/llm_bench.py              # 30 примеров
  uv run python benchmarks/llm_bench.py --limit 50
  uv run python benchmarks/llm_bench.py --limit 0    # все
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import time

from models.llm import LlamaCppClient
from models.llm.load import DEFAULT_QUANT, DEFAULT_REPO, model_path
from mock_categories import CATEGORIES
from paths import DATASET_PATH
from service.pipeline import run_analyze

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


class _WhitespaceTokenizer:
    """Простой токенизатор для ROUGE — `.split()` без стеммера/пунктуации."""

    def tokenize(self, text: str) -> list[str]:
        return text.lower().split()


def load_test_set() -> tuple[list[str], list[int], list[dict]]:
    texts, labels, answers = [], [], []
    with open(DATASET_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ex = json.loads(line)
            if ex.get("__meta__") or "messages" not in ex:
                continue
            if ex.get("split") != "test":
                continue
            answer = json.loads(ex["messages"][1]["content"])
            texts.append(ex["messages"][0]["content"])
            labels.append(1 if answer["is_important"] else 0)
            answers.append(answer)
    return texts, labels, answers


async def amain() -> None:
    parser = argparse.ArgumentParser(description="Benchmark LLM (qwen3-4b GGUF) on test set")
    parser.add_argument("--limit", type=int, default=30, help="Number of examples (0=all)")
    parser.add_argument("--repo", default=os.getenv("LLM_REPO", DEFAULT_REPO))
    parser.add_argument("--quant", default=os.getenv("LLM_QUANT", DEFAULT_QUANT))
    parser.add_argument("--n-gpu-layers", type=int, default=int(os.getenv("LLM_N_GPU_LAYERS", "0")))
    args = parser.parse_args()

    gguf = model_path(args.repo, args.quant)
    logger.info("LLM: %s", gguf)

    test_texts, test_labels, test_answers = load_test_set()
    if args.limit > 0:
        test_texts = test_texts[: args.limit]
        test_labels = test_labels[: args.limit]
        test_answers = test_answers[: args.limit]

    logger.info("Test: %d examples (imp=%d, not=%d)",
                len(test_texts), sum(test_labels), len(test_labels) - sum(test_labels))

    from rouge_score import rouge_scorer
    from sklearn.metrics import f1_score

    scorer = rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"],
        use_stemmer=False,
        tokenizer=_WhitespaceTokenizer(),
    )

    client = LlamaCppClient(model_path=gguf, n_gpu_layers=args.n_gpu_layers)

    preds_imp, true_imp = [], []
    cat_correct, cat_total = 0, 0
    sub_correct, sub_total = 0, 0
    failed = 0
    form_r1, form_r2, form_rl = [], [], []
    latencies = []

    try:
        for i, (text, label, expected) in enumerate(zip(test_texts, test_labels, test_answers, strict=False)):
            t0 = time.time()
            try:
                actual = await run_analyze(client, text, CATEGORIES)
            except Exception as e:
                logger.warning("Example %d failed: %s", i + 1, e)
                failed += 1
                continue
            latencies.append(time.time() - t0)

            preds_imp.append(1 if actual.get("is_important") else 0)
            true_imp.append(label)

            if expected["is_important"]:
                exp_cat = (expected.get("category") or {}).get("id")
                act_cat = (actual.get("category") or {}).get("id")
                if exp_cat:
                    cat_total += 1
                    if exp_cat == act_cat:
                        cat_correct += 1

                exp_sub = (expected.get("subcategory") or {}).get("id")
                act_sub = (actual.get("subcategory") or {}).get("id")
                if exp_sub:
                    sub_total += 1
                    if exp_sub == act_sub:
                        sub_correct += 1

                ref_form = expected.get("formalized_text", "")
                pred_form = actual.get("formalized_text", "")
                if ref_form and pred_form:
                    sc = scorer.score(ref_form, pred_form)
                    form_r1.append(sc["rouge1"].fmeasure)
                    form_r2.append(sc["rouge2"].fmeasure)
                    form_rl.append(sc["rougeL"].fmeasure)

            if (i + 1) % 5 == 0:
                logger.info("  %d/%d done (avg %.1fs/req)",
                            i + 1, len(test_texts), sum(latencies) / len(latencies))
    finally:
        client.close()

    def avg(lst: list[float]) -> float:
        return sum(lst) / len(lst) if lst else 0.0

    f1m = f1_score(true_imp, preds_imp, average="macro") if true_imp else 0.0
    f1b = f1_score(true_imp, preds_imp, average="binary") if true_imp else 0.0
    imp_acc = sum(1 for a, b in zip(true_imp, preds_imp, strict=False) if a == b) / len(true_imp) if true_imp else 0.0

    print(f"\n{'=' * 65}")
    print(f"  LLM BENCHMARK ({gguf.name}, zero-shot)")
    print(f"{'=' * 65}")

    print("\n--- 1. QUALITY ---")
    print(f"  Tested:           {len(latencies)}")
    print(f"  Failed requests:  {failed}")
    print("  Classification:")
    print(f"    is_important acc:  {imp_acc:.4f}")
    print(f"    is_important F1-m: {f1m:.4f}")
    print(f"    is_important F1-b: {f1b:.4f}")
    if cat_total:
        print(f"    category acc:      {cat_correct/cat_total:.4f} ({cat_correct}/{cat_total})")
    if sub_total:
        print(f"    subcategory acc:   {sub_correct/sub_total:.4f} ({sub_correct}/{sub_total})")
    print(f"  Formalization ({len(form_rl)} examples):")
    print(f"    ROUGE-1: {avg(form_r1):.4f}  ROUGE-2: {avg(form_r2):.4f}  ROUGE-L: {avg(form_rl):.4f}")

    print("\n--- 2. LATENCY ---")
    if latencies:
        sl = sorted(latencies)
        print(f"    Avg:   {avg(latencies) * 1000:.0f} ms")
        print(f"    p50:   {sl[len(sl) // 2] * 1000:.0f} ms")
        print(f"    p95:   {sl[int(len(sl) * 0.95)] * 1000:.0f} ms")
        print(f"    Total: {sum(latencies):.0f} s")


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
