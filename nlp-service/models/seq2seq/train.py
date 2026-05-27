#!/usr/bin/env python3
"""Fine-tune rut5-base-multitask на формализацию (prefix 'формализуй:')."""

import argparse
import logging

import torch
from rouge_score import rouge_scorer
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    T5ForConditionalGeneration,
)

from models import Example, get_device, load_examples, split_by_templates
from models.seq2seq import BASE_MODEL
from paths import CACHE_DIR, DATASET_PATH, TRAINED_SEQ2SEQ_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = TRAINED_SEQ2SEQ_DIR


def build_pairs(examples: list[Example]) -> tuple[list[str], list[str], list[str]]:
    inputs, targets, template_ids = [], [], []
    for ex in examples:
        if not ex.answer["is_important"]:
            continue
        formalized = ex.answer.get("formalized_text", "").strip()
        if formalized:
            inputs.append(f"формализуй: {ex.text}")
            targets.append(formalized)
            template_ids.append(ex.template_id)

    logger.info("Built %d pairs (templates=%d)", len(inputs), len(set(template_ids)))
    return inputs, targets, template_ids


def make_dataset(tokenizer, inputs: list[str], targets: list[str], max_src: int, max_tgt: int):
    src_enc = tokenizer(inputs, truncation=True, max_length=max_src)
    tgt_enc = tokenizer(targets, truncation=True, max_length=max_tgt)

    class _DS(Dataset):
        def __len__(self):
            return len(inputs)

        def __getitem__(self, idx):
            return {
                "input_ids": src_enc["input_ids"][idx],
                "attention_mask": src_enc["attention_mask"][idx],
                "labels": tgt_enc["input_ids"][idx],
            }

    return _DS()


def make_compute_metrics(tokenizer, use_bertscore: bool = False):
    class _WhitespaceTokenizer:
        def tokenize(self, text):
            return text.lower().split()

    scorer = rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"],
        use_stemmer=False,
        tokenizer=_WhitespaceTokenizer(),
    )

    def compute_metrics(eval_pred):
        import numpy as np

        preds, labels = eval_pred
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        preds = np.where(preds < 0, tokenizer.pad_token_id, preds)

        decoded_preds = tokenizer.batch_decode(preds, skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

        r1, r2, rl = [], [], []
        for pred, ref in zip(decoded_preds, decoded_labels, strict=True):
            s = scorer.score(ref.strip(), pred.strip())
            r1.append(s["rouge1"].fmeasure)
            r2.append(s["rouge2"].fmeasure)
            rl.append(s["rougeL"].fmeasure)

        result = {
            "rouge1": float(np.mean(r1)),
            "rouge2": float(np.mean(r2)),
            "rougeL": float(np.mean(rl)),
        }
        if use_bertscore:
            from bert_score import score as bert_score_fn

            _, _, f1 = bert_score_fn(decoded_preds, decoded_labels, lang="ru", verbose=False)
            result["bertscore_f1"] = float(f1.mean())
        return result

    return compute_metrics


def train(args: argparse.Namespace) -> None:
    logger.info("Loading tokenizer: %s", BASE_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR, use_fast=True)

    examples = load_examples(DATASET_PATH)
    all_inputs, all_targets, all_tids = build_pairs(examples)

    train_idx, val_idx, test_idx = split_by_templates(
        all_tids, val_ratio=args.val_ratio, test_ratio=args.test_ratio,
    )

    train_inputs = [all_inputs[i] for i in train_idx]
    train_targets = [all_targets[i] for i in train_idx]
    val_inputs = [all_inputs[i] for i in val_idx]
    val_targets = [all_targets[i] for i in val_idx]
    test_inputs = [all_inputs[i] for i in test_idx]
    test_targets = [all_targets[i] for i in test_idx]

    logger.info("Split: Train=%d  Val=%d  Test=%d", len(train_inputs), len(val_inputs), len(test_inputs))

    train_ds = make_dataset(tokenizer, train_inputs, train_targets, args.max_src, args.max_tgt)
    val_ds = make_dataset(tokenizer, val_inputs, val_targets, args.max_src, args.max_tgt)

    logger.info("Loading model: %s", BASE_MODEL)
    model = T5ForConditionalGeneration.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    device = get_device(args.device)
    if args.device == "cuda" and not torch.cuda.is_available():
        logger.warning("--device cuda запрошен, но недоступно — переключаемся на CPU")
    logger.info("Device: %s", device)

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="rouge1",
        predict_with_generate=True,
        generation_max_length=args.max_tgt,
        generation_num_beams=4,
        logging_steps=50,
        warmup_ratio=0.05,
        fp16=(device == "cuda"),
        use_cpu=(device == "cpu"),
        torch_compile=args.torch_compile,
        report_to="none",
    )

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=collator,
        compute_metrics=make_compute_metrics(tokenizer, use_bertscore=False),
    )

    logger.info("Training started...")
    trainer.train(resume_from_checkpoint=args.resume)

    logger.info("Saving to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    trainer.compute_metrics = make_compute_metrics(tokenizer, use_bertscore=True)
    metrics = trainer.evaluate()
    logger.info(
        "Val: ROUGE-1=%.4f  ROUGE-2=%.4f  ROUGE-L=%.4f  BERTScore-F1=%.4f",
        metrics.get("eval_rouge1", 0),
        metrics.get("eval_rouge2", 0),
        metrics.get("eval_rougeL", 0),
        metrics.get("eval_bertscore_f1", 0),
    )

    if test_inputs:
        test_ds = make_dataset(tokenizer, test_inputs, test_targets, args.max_src, args.max_tgt)
        test_metrics = trainer.evaluate(eval_dataset=test_ds, metric_key_prefix="test")
        logger.info(
            "Test: ROUGE-1=%.4f  ROUGE-2=%.4f  ROUGE-L=%.4f  BERTScore-F1=%.4f",
            test_metrics.get("test_rouge1", 0),
            test_metrics.get("test_rouge2", 0),
            test_metrics.get("test_rougeL", 0),
            test_metrics.get("test_bertscore_f1", 0),
        )

    logger.info("Done. Saved to %s", OUTPUT_DIR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rut5 for formalization")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--lr", type=float, default=5e-5)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--max-src", type=int, default=512)
    parser.add_argument("--max-tgt", type=int, default=80)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default=None)
    parser.add_argument("--torch-compile", action="store_true",
                        help="Включить torch.compile. Первая итерация дольше, дальше быстрее.")
    parser.add_argument("--resume", action="store_true",
                        help="Продолжить из последнего checkpoint в trained_models/seq2seq/.")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
