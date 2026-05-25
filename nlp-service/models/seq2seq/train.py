#!/usr/bin/env python3
"""Fine-tune rut5-base-multitask на формализацию: prefix 'формализуй:'.
Используем только important-примеры — неважным нечего формализовать.
Результат: trained_models/seq2seq/. CPU ~2ч, GPU ~15мин."""

import argparse
import logging

from models import Example, get_device, load_examples, split_by_templates
from models.seq2seq import BASE_MODEL
from paths import CACHE_DIR, DATASET_PATH, TRAINED_SEQ2SEQ_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = TRAINED_SEQ2SEQ_DIR


def build_pairs(examples: list[Example]) -> tuple[list[str], list[str], list[str]]:
    inputs: list[str] = []
    targets: list[str] = []
    template_ids: list[str] = []

    for ex in examples:
        if not ex.answer["is_important"]:
            continue

        formalized = ex.answer.get("formalized_text", "").strip()
        if formalized:
            inputs.append(f"формализуй: {ex.text}")
            targets.append(formalized)
            template_ids.append(ex.template_id)

    logger.info(
        "Built %d input-target pairs (templates=%d)",
        len(inputs),
        len(set(template_ids)),
    )
    return inputs, targets, template_ids


def make_dataset(tokenizer, inputs: list[str], targets: list[str], max_src: int, max_tgt: int):
    from torch.utils.data import Dataset

    # Без padding здесь — DataCollatorForSeq2Seq паддит батч динамически,
    # экономит память на батчах с короткими последовательностями.
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
    """BERTScore медленный на CPU (~2-5 сек/батч) — включать только для финальной оценки."""
    from rouge_score import rouge_scorer

    # rouge_score не поддерживает кириллицу. Токенизатор по пробелам работает для русского.
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

        # HF Trainer ставит -100 на позиции паддинга в labels, а generation
        # может вернуть отрицательные id при beam search — заменяем на pad.
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        preds = np.where(preds < 0, tokenizer.pad_token_id, preds)

        decoded_preds = tokenizer.batch_decode(preds, skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

        r1_scores, r2_scores, rl_scores = [], [], []
        for pred, ref in zip(decoded_preds, decoded_labels, strict=True):
            scores = scorer.score(ref.strip(), pred.strip())
            r1_scores.append(scores["rouge1"].fmeasure)
            r2_scores.append(scores["rouge2"].fmeasure)
            rl_scores.append(scores["rougeL"].fmeasure)

        result = {
            "rouge1": float(np.mean(r1_scores)),
            "rouge2": float(np.mean(r2_scores)),
            "rougeL": float(np.mean(rl_scores)),
        }

        if use_bertscore:
            from bert_score import score as bert_score_fn

            _, _, f1 = bert_score_fn(
                decoded_preds,
                decoded_labels,
                lang="ru",
                verbose=False,
            )
            result["bertscore_f1"] = float(f1.mean())

        return result

    return compute_metrics


def train(args: argparse.Namespace) -> None:
    import torch
    from transformers import (
        DataCollatorForSeq2Seq,
        Seq2SeqTrainer,
        Seq2SeqTrainingArguments,
        T5ForConditionalGeneration,
        T5Tokenizer,
    )

    logger.info("Loading tokenizer: %s", BASE_MODEL)
    tokenizer = T5Tokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    examples = load_examples(DATASET_PATH)
    all_inputs, all_targets, all_tids = build_pairs(examples)

    train_idx, val_idx, test_idx = split_by_templates(
        all_tids,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
    )

    train_inputs = [all_inputs[i] for i in train_idx]
    train_targets = [all_targets[i] for i in train_idx]
    val_inputs = [all_inputs[i] for i in val_idx]
    val_targets = [all_targets[i] for i in val_idx]
    test_inputs = [all_inputs[i] for i in test_idx]
    test_targets = [all_targets[i] for i in test_idx]

    logger.info(
        "Split by templates: Train=%d  Val=%d  Test=%d (hold-out)",
        len(train_inputs),
        len(val_inputs),
        len(test_inputs),
    )

    train_ds = make_dataset(tokenizer, train_inputs, train_targets, args.max_src, args.max_tgt)
    val_ds = make_dataset(tokenizer, val_inputs, val_targets, args.max_src, args.max_tgt)

    logger.info("Loading model: %s", BASE_MODEL)
    model = T5ForConditionalGeneration.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    device = get_device(args.device)
    if args.device == "cuda" and not torch.cuda.is_available():
        logger.warning("--device cuda запрошен, но CUDA недоступна — переключаемся на CPU")

    if device == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        device_label = f"GPU ({gpu_name}, {gpu_mem_gb:.1f} GB, fp16)"
        use_fp16 = True
    elif device == "mps":
        device_label = "MPS (Apple Silicon, fp32)"
        use_fp16 = False
    else:
        device_label = "CPU (fp32)"
        use_fp16 = False
    logger.info("Device: %s", device_label)

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
        fp16=use_fp16,
        use_cpu=(device == "cpu"),
        report_to="none",
    )

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)

    epoch_metrics_fn = make_compute_metrics(tokenizer, use_bertscore=False)

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=collator,
        compute_metrics=epoch_metrics_fn,
    )

    actual_device = next(trainer.model.parameters()).device
    logger.info("Model actually on: %s", actual_device)
    if device == "cuda" and actual_device.type != "cuda":
        logger.warning("Ожидался CUDA, но модель на %s — проверь окружение", actual_device)

    logger.info("Training started...")
    trainer.train()

    logger.info("Saving model to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    # Финальная оценка — включаем BERTScore (дорогой, но информативный).
    final_metrics_fn = make_compute_metrics(tokenizer, use_bertscore=True)
    trainer.compute_metrics = final_metrics_fn

    metrics = trainer.evaluate()
    logger.info(
        "Val metrics: ROUGE-1=%.4f  ROUGE-2=%.4f  ROUGE-L=%.4f  BERTScore-F1=%.4f",
        metrics.get("eval_rouge1", 0),
        metrics.get("eval_rouge2", 0),
        metrics.get("eval_rougeL", 0),
        metrics.get("eval_bertscore_f1", 0),
    )

    if test_inputs:
        test_ds = make_dataset(tokenizer, test_inputs, test_targets, args.max_src, args.max_tgt)
        test_metrics = trainer.evaluate(eval_dataset=test_ds, metric_key_prefix="test")
        logger.info(
            "Test metrics (hold-out): ROUGE-1=%.4f  ROUGE-2=%.4f  ROUGE-L=%.4f  BERTScore-F1=%.4f",
            test_metrics.get("test_rouge1", 0),
            test_metrics.get("test_rouge2", 0),
            test_metrics.get("test_rougeL", 0),
            test_metrics.get("test_bertscore_f1", 0),
        )

    logger.info("Done. Model saved to %s", OUTPUT_DIR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rut5 for formalization")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--lr", type=float, default=5e-5)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--max-src", type=int, default=128)
    parser.add_argument("--max-tgt", type=int, default=80)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default=None)
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
