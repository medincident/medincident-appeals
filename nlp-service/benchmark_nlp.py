#!/usr/bin/env python3
"""
benchmark_nlp.py — полный бенчмарк NLP-pipeline на test set.

Запуск:
  cd nlp-service
  python3 benchmark_nlp.py                # полный бенчмарк
  python3 benchmark_nlp.py --limit 50     # ограничить примеры (seq2seq медленный)
  python3 benchmark_nlp.py --skip-seq2seq # только classifier + category

Измеряет:
  1. Качество: accuracy, F1, category/subcategory accuracy, ROUGE
  2. Latency: per-component и total pipeline
  3. Memory: размер моделей на диске и в RAM (torch)
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH = Path(__file__).parent.parent / "dataset.jsonl"

sys.path.insert(0, str(Path(__file__).parent.parent / "categories-service"))
from categories import CATEGORIES  # noqa: E402


# ── загрузка test set ────────────────────────────────────────────────────────

def load_test_set():
    from train_classifier import load_dataset, split_by_templates

    texts, labels, template_ids = load_dataset(DATASET_PATH)
    _, _, test_idx = split_by_templates(template_ids)

    all_answers = []
    with open(DATASET_PATH, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            all_answers.append(json.loads(ex["messages"][1]["content"]))

    test_texts = [texts[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]
    test_answers = [all_answers[i] for i in test_idx]
    return test_texts, test_labels, test_answers


# ── замеры памяти ────────────────────────────────────────────────────────────

def measure_model_disk_size(cache_dir: Path, model_name: str) -> int:
    """Размер модели на диске (bytes)."""
    model_dir = cache_dir / f"models--{model_name.replace('/', '--')}"
    if not model_dir.exists():
        return 0
    total = 0
    for f in model_dir.rglob("*"):
        if f.is_file() and not f.name.startswith("."):
            total += f.stat().st_size
    return total


def measure_torch_memory():
    """Текущее потребление torch (GPU). Для CPU возвращает RSS процесса."""
    import torch
    if torch.cuda.is_available():
        return {
            "gpu_allocated_mb": torch.cuda.memory_allocated() / 1024 / 1024,
            "gpu_max_allocated_mb": torch.cuda.max_memory_allocated() / 1024 / 1024,
        }
    # CPU: измеряем RSS процесса
    try:
        import resource
        rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return {"process_rss_mb": rss_kb / 1024}
    except Exception:
        return {"process_rss_mb": 0}


# ── бенчмарк ─────────────────────────────────────────────────────────────────

def run_benchmark(args):
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
    from rouge_score import rouge_scorer

    class _WS:
        def tokenize(self, text):
            return text.lower().split()

    scorer = rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"], use_stemmer=False, tokenizer=_WS(),
    )

    # ── загрузка моделей ─────────────────────────────────────────────────
    from models.classifier import ImportanceClassifier
    from models.seq2seq import TextProcessor
    from models.similarity import CategoryMatcher

    mem_before = measure_torch_memory()

    logger.info("Loading models...")
    t_load = time.time()

    clf = ImportanceClassifier()
    clf.load()
    t_clf_loaded = time.time()

    proc = TextProcessor()
    proc.load()
    t_proc_loaded = time.time()

    matcher = CategoryMatcher()
    matcher.load()
    matcher.update_categories(CATEGORIES)
    t_all_loaded = time.time()

    mem_after = measure_torch_memory()

    load_times = {
        "classifier_s": t_clf_loaded - t_load,
        "seq2seq_s": t_proc_loaded - t_clf_loaded,
        "matcher_s": t_all_loaded - t_proc_loaded,
        "total_s": t_all_loaded - t_load,
    }

    # Размеры на диске
    cache_dir = Path(__file__).parent / "models_cache"
    disk_sizes = {
        "rubert-tiny2": measure_model_disk_size(cache_dir, "cointegrated/rubert-tiny2"),
        "rut5-base-multitask": measure_model_disk_size(cache_dir, "cointegrated/rut5-base-multitask"),
        "MiniLM-L12-v2": measure_model_disk_size(cache_dir, "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"),
    }

    # ── загрузка test set ────────────────────────────────────────────────
    test_texts, test_labels, test_answers = load_test_set()
    if args.limit:
        test_texts = test_texts[:args.limit]
        test_labels = test_labels[:args.limit]
        test_answers = test_answers[:args.limit]

    logger.info("Test set: %d examples (imp=%d, not=%d)",
                len(test_texts), sum(test_labels), len(test_labels) - sum(test_labels))

    # ── прогон pipeline ──────────────────────────────────────────────────
    clf_preds, clf_latencies = [], []
    form_r1, form_r2, form_rl = [], [], []
    thes_r1, thes_r2, thes_rl = [], [], []
    cat_correct, cat_total = 0, 0
    sub_correct, sub_total = 0, 0
    seq2seq_latencies = []
    matcher_latencies = []
    pipeline_latencies = []

    for i, (text, label, expected) in enumerate(zip(test_texts, test_labels, test_answers)):
        t_start = time.time()

        # Step 1: Classifier
        t0 = time.time()
        is_imp, conf = clf.predict(text)
        clf_latencies.append(time.time() - t0)
        clf_preds.append(1 if is_imp else 0)

        if is_imp and expected["is_important"] and not args.skip_seq2seq:
            # Step 2: Formalize + theses
            t0 = time.time()
            formalized = proc.formalize(text)
            theses = proc.extract_theses(text)
            seq2seq_latencies.append(time.time() - t0)

            # Step 3: Category match
            t0 = time.time()
            cat_result, sub_result = matcher.match(text, formalized)
            matcher_latencies.append(time.time() - t0)

            # ROUGE formalize
            ref_form = expected.get("formalized_text", "")
            if ref_form and formalized:
                sc = scorer.score(ref_form, formalized)
                form_r1.append(sc["rouge1"].fmeasure)
                form_r2.append(sc["rouge2"].fmeasure)
                form_rl.append(sc["rougeL"].fmeasure)

            # ROUGE theses
            ref_theses = expected.get("theses", [])
            if ref_theses and theses:
                ref_str = "\n".join(f"- {t}" for t in ref_theses)
                pred_str = "\n".join(f"- {t}" for t in theses)
                sc = scorer.score(ref_str, pred_str)
                thes_r1.append(sc["rouge1"].fmeasure)
                thes_r2.append(sc["rouge2"].fmeasure)
                thes_rl.append(sc["rougeL"].fmeasure)

            # Category accuracy
            exp_cat = (expected.get("category") or {}).get("id")
            act_cat = (cat_result or {}).get("id")
            if exp_cat:
                cat_total += 1
                if exp_cat == act_cat:
                    cat_correct += 1

            exp_sub = (expected.get("subcategory") or {}).get("id")
            act_sub = (sub_result or {}).get("id")
            if exp_sub:
                sub_total += 1
                if exp_sub == act_sub:
                    sub_correct += 1

        pipeline_latencies.append(time.time() - t_start)

        if (i + 1) % 50 == 0:
            logger.info("  %d/%d done", i + 1, len(test_texts))

    # ── результаты ───────────────────────────────────────────────────────
    def avg(lst):
        return sum(lst) / len(lst) if lst else 0.0

    acc = accuracy_score(test_labels, clf_preds)
    f1m = f1_score(test_labels, clf_preds, average="macro")
    f1b = f1_score(test_labels, clf_preds, average="binary")
    prec = precision_score(test_labels, clf_preds, average="macro", zero_division=0)
    rec = recall_score(test_labels, clf_preds, average="macro", zero_division=0)

    clf_status = "fine-tuned" if clf.is_finetuned else "base"
    proc_status = "fine-tuned" if proc.is_finetuned else "base"
    subtitle = f"classifier={clf_status}, seq2seq={proc_status}"
    print(f"\n{'='*65}")
    print(f"  NLP-PIPELINE BENCHMARK ({subtitle})")
    print(f"{'='*65}")

    print(f"\n--- 1. QUALITY METRICS ---")
    print(f"  Classifier ({len(test_texts)} examples):")
    print(f"    Accuracy:        {acc:.4f}")
    print(f"    F1-macro:        {f1m:.4f}")
    print(f"    F1-binary (imp): {f1b:.4f}")
    print(f"    Precision-macro: {prec:.4f}")
    print(f"    Recall-macro:    {rec:.4f}")

    if cat_total > 0:
        print(f"  CategoryMatcher ({cat_total} important examples):")
        print(f"    Category acc:    {cat_correct/cat_total:.4f} ({cat_correct}/{cat_total})")
        print(f"    Subcategory acc: {sub_correct/sub_total:.4f} ({sub_correct}/{sub_total})")

    if form_rl:
        print(f"  Seq2seq formalize ({len(form_rl)} examples):")
        print(f"    ROUGE-1: {avg(form_r1):.4f}  ROUGE-2: {avg(form_r2):.4f}  ROUGE-L: {avg(form_rl):.4f}")
    if thes_rl:
        print(f"  Seq2seq theses ({len(thes_rl)} examples):")
        print(f"    ROUGE-1: {avg(thes_r1):.4f}  ROUGE-2: {avg(thes_r2):.4f}  ROUGE-L: {avg(thes_rl):.4f}")

    print(f"\n--- 2. LATENCY ---")
    print(f"  Model load:     {load_times['total_s']:.1f}s total")
    print(f"    classifier:   {load_times['classifier_s']:.1f}s")
    print(f"    seq2seq:      {load_times['seq2seq_s']:.1f}s")
    print(f"    matcher:      {load_times['matcher_s']:.1f}s")
    print(f"  Inference (per example):")
    print(f"    classifier:   {avg(clf_latencies)*1000:.1f} ms")
    if seq2seq_latencies:
        print(f"    seq2seq:      {avg(seq2seq_latencies)*1000:.0f} ms")
    if matcher_latencies:
        print(f"    matcher:      {avg(matcher_latencies)*1000:.1f} ms")
    print(f"    full pipeline:{avg(pipeline_latencies)*1000:.0f} ms")
    if pipeline_latencies:
        p50 = sorted(pipeline_latencies)[len(pipeline_latencies)//2]
        p95 = sorted(pipeline_latencies)[int(len(pipeline_latencies)*0.95)]
        print(f"    p50:          {p50*1000:.0f} ms")
        print(f"    p95:          {p95*1000:.0f} ms")

    print(f"\n--- 3. MEMORY ---")
    print(f"  Model disk size:")
    total_disk = 0
    for name, size in disk_sizes.items():
        mb = size / 1024 / 1024
        total_disk += size
        print(f"    {name}: {mb:.0f} MB")
    print(f"    TOTAL: {total_disk/1024/1024:.0f} MB")

    print(f"  Process memory:")
    for k, v in mem_after.items():
        print(f"    {k}: {v:.0f} MB")


def main():
    parser = argparse.ArgumentParser(description="Benchmark NLP pipeline")
    parser.add_argument("--limit", type=int, default=None, help="Limit test examples")
    parser.add_argument("--skip-seq2seq", action="store_true", help="Skip seq2seq (fast mode)")
    args = parser.parse_args()

    run_benchmark(args)


if __name__ == "__main__":
    main()
