#!/usr/bin/env python3
"""
eval_baseline.py — оценка базовых (нетренированных) NLP-моделей на test set.

Запуск:
  cd nlp-service
  python3 eval_baseline.py                # полная оценка (classifier + seq2seq)
  python3 eval_baseline.py --skip-seq2seq # только classifier (быстро)
  python3 eval_baseline.py --limit 50     # ограничить кол-во примеров

Что делает:
  1. Загружает dataset.jsonl и делает split по template_id (70/15/15)
  2. Тестирует ImportanceClassifier (rubert-tiny2 base) на test set
     → accuracy, F1-macro, precision, recall, confusion matrix
  3. Тестирует TextProcessor (rut5-base-multitask base) на important test примерах
     → ROUGE-1, ROUGE-2, ROUGE-L для формализации и тезисов
  4. Выводит результаты в консоль
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH = Path(__file__).parent.parent / "dataset.jsonl"


def load_test_set():
    """Загружает датасет и возвращает test split."""
    sys.path.insert(0, str(Path(__file__).parent))
    from train_classifier import load_dataset, split_by_templates

    texts, labels, template_ids = load_dataset(DATASET_PATH)
    _, _, test_idx = split_by_templates(template_ids)

    test_texts = [texts[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]

    # Для seq2seq нужны также formalized_text и theses
    test_answers = []
    all_answers = []
    with open(DATASET_PATH, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            all_answers.append(json.loads(ex["messages"][1]["content"]))
    for i in test_idx:
        test_answers.append(all_answers[i])

    return test_texts, test_labels, test_answers


def eval_classifier(test_texts, test_labels, limit=None):
    """Оценка ImportanceClassifier на test set."""
    from sklearn.metrics import (
        accuracy_score, f1_score, precision_score, recall_score, confusion_matrix,
    )
    from models.classifier import ImportanceClassifier

    logger.info("Loading ImportanceClassifier (base model)...")
    clf = ImportanceClassifier()
    clf.load()

    texts = test_texts[:limit] if limit else test_texts
    labels = test_labels[:limit] if limit else test_labels

    preds = []
    t0 = time.time()
    for i, text in enumerate(texts):
        is_imp, conf = clf.predict(text)
        preds.append(1 if is_imp else 0)
        if (i + 1) % 50 == 0:
            logger.info("  Classifier: %d/%d done", i + 1, len(texts))
    elapsed = time.time() - t0

    acc = accuracy_score(labels, preds)
    f1 = f1_score(labels, preds, average="macro")
    f1_bin = f1_score(labels, preds, average="binary")
    prec = precision_score(labels, preds, average="macro", zero_division=0)
    rec = recall_score(labels, preds, average="macro", zero_division=0)
    cm = confusion_matrix(labels, preds)

    results = {
        "accuracy": acc,
        "f1_macro": f1,
        "f1_binary": f1_bin,
        "precision_macro": prec,
        "recall_macro": rec,
        "confusion_matrix": cm.tolist(),
        "total": len(texts),
        "latency_avg_ms": (elapsed / len(texts)) * 1000,
        "latency_total_s": elapsed,
    }

    print("\n=== CLASSIFIER (base rubert-tiny2, no fine-tune) ===")
    print(f"  Examples:        {len(texts)}")
    print(f"  Accuracy:        {acc:.4f}")
    print(f"  F1-macro:        {f1:.4f}")
    print(f"  F1-binary (imp): {f1_bin:.4f}")
    print(f"  Precision-macro: {prec:.4f}")
    print(f"  Recall-macro:    {rec:.4f}")
    print(f"  Confusion matrix (rows=true, cols=pred):")
    print(f"    TN={cm[0][0]}  FP={cm[0][1]}")
    print(f"    FN={cm[1][0]}  TP={cm[1][1]}")
    print(f"  Avg latency:     {results['latency_avg_ms']:.1f} ms/example")

    return results


def eval_seq2seq(test_texts, test_answers, limit=None):
    """Оценка TextProcessor на important test примерах."""
    from rouge_score import rouge_scorer
    from models.seq2seq import TextProcessor

    class _WhitespaceTokenizer:
        def tokenize(self, text):
            return text.lower().split()

    scorer = rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"],
        use_stemmer=False,
        tokenizer=_WhitespaceTokenizer(),
    )

    logger.info("Loading TextProcessor (base model)...")
    proc = TextProcessor()
    proc.load()

    # Только important примеры
    imp_texts = []
    imp_answers = []
    for text, ans in zip(test_texts, test_answers):
        if ans["is_important"]:
            imp_texts.append(text)
            imp_answers.append(ans)

    if limit:
        imp_texts = imp_texts[:limit]
        imp_answers = imp_answers[:limit]

    # Формализация
    form_r1, form_r2, form_rl = [], [], []
    # Тезисы
    thes_r1, thes_r2, thes_rl = [], [], []

    t0 = time.time()
    for i, (text, ans) in enumerate(zip(imp_texts, imp_answers)):
        # Формализация
        pred_form = proc.formalize(text)
        ref_form = ans["formalized_text"]
        if ref_form and pred_form:
            sc = scorer.score(ref_form, pred_form)
            form_r1.append(sc["rouge1"].fmeasure)
            form_r2.append(sc["rouge2"].fmeasure)
            form_rl.append(sc["rougeL"].fmeasure)

        # Тезисы
        pred_theses = proc.extract_theses(text)
        ref_theses = ans.get("theses", [])
        if ref_theses and pred_theses:
            ref_str = "\n".join(f"- {t}" for t in ref_theses)
            pred_str = "\n".join(f"- {t}" for t in pred_theses)
            sc = scorer.score(ref_str, pred_str)
            thes_r1.append(sc["rouge1"].fmeasure)
            thes_r2.append(sc["rouge2"].fmeasure)
            thes_rl.append(sc["rougeL"].fmeasure)

        if (i + 1) % 20 == 0:
            logger.info("  Seq2seq: %d/%d done", i + 1, len(imp_texts))

    elapsed = time.time() - t0

    def avg(lst):
        return sum(lst) / len(lst) if lst else 0.0

    results = {
        "formalize": {
            "rouge1": avg(form_r1), "rouge2": avg(form_r2), "rougeL": avg(form_rl),
            "count": len(form_r1),
        },
        "theses": {
            "rouge1": avg(thes_r1), "rouge2": avg(thes_r2), "rougeL": avg(thes_rl),
            "count": len(thes_r1),
        },
        "total": len(imp_texts),
        "latency_avg_ms": (elapsed / len(imp_texts)) * 1000 if imp_texts else 0,
        "latency_total_s": elapsed,
    }

    print("\n=== SEQ2SEQ (base rut5-base-multitask, no fine-tune) ===")
    print(f"  Important test examples: {len(imp_texts)}")
    print(f"  --- Formalization ---")
    print(f"    ROUGE-1: {results['formalize']['rouge1']:.4f}")
    print(f"    ROUGE-2: {results['formalize']['rouge2']:.4f}")
    print(f"    ROUGE-L: {results['formalize']['rougeL']:.4f}")
    print(f"  --- Theses ---")
    print(f"    ROUGE-1: {results['theses']['rouge1']:.4f}")
    print(f"    ROUGE-2: {results['theses']['rouge2']:.4f}")
    print(f"    ROUGE-L: {results['theses']['rougeL']:.4f}")
    print(f"  Avg latency: {results['latency_avg_ms']:.0f} ms/example")

    return results


def main():
    parser = argparse.ArgumentParser(description="Evaluate baseline (untrained) NLP models")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of test examples (default: all)")
    parser.add_argument("--skip-seq2seq", action="store_true",
                        help="Skip seq2seq evaluation (slow on CPU)")
    args = parser.parse_args()

    test_texts, test_labels, test_answers = load_test_set()
    logger.info("Test set: %d examples (important=%d, not=%d)",
                len(test_texts), sum(test_labels), len(test_labels) - sum(test_labels))

    clf_results = eval_classifier(test_texts, test_labels, limit=args.limit)

    seq_results = None
    if not args.skip_seq2seq:
        seq_results = eval_seq2seq(test_texts, test_answers, limit=args.limit)

    print("\n=== SUMMARY ===")
    print(f"Classifier F1-macro: {clf_results['f1_macro']:.4f}")
    if seq_results:
        print(f"Formalize ROUGE-L:   {seq_results['formalize']['rougeL']:.4f}")
        print(f"Theses ROUGE-L:      {seq_results['theses']['rougeL']:.4f}")


if __name__ == "__main__":
    main()
