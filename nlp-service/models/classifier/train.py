#!/usr/bin/env python3
"""Fine-tune rubert-tiny2 на бинарную классификацию important/not_important.
Результат: trained_models/classifier/. CPU ~20мин, GPU ~3мин."""

import argparse
import logging

from models import get_device, load_examples, split_by_templates
from paths import CACHE_DIR, DATASET_PATH, TRAINED_CLASSIFIER_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rubert-tiny2"
OUTPUT_DIR = TRAINED_CLASSIFIER_DIR


def tokenize(tokenizer, texts: list[str], labels: list[int], max_len: int):
    import torch
    from torch.utils.data import Dataset

    encodings = tokenizer(
        texts,
        truncation=True,
        padding=True,
        max_length=max_len,
        return_tensors="pt",
    )

    class _DS(Dataset):
        def __len__(self):
            return len(labels)

        def __getitem__(self, idx):
            return {
                "input_ids": encodings["input_ids"][idx],
                "attention_mask": encodings["attention_mask"][idx],
                "labels": torch.tensor(labels[idx], dtype=torch.long),
            }

    return _DS()


def compute_metrics(eval_pred):
    import numpy as np
    from sklearn.metrics import f1_score

    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    f1 = f1_score(labels, preds, average="binary")
    acc = (preds == labels).mean()
    return {"accuracy": float(acc), "f1": float(f1)}


def train(args: argparse.Namespace) -> None:
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    logger.info("Loading tokenizer: %s", BASE_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    examples = load_examples(DATASET_PATH)
    texts = [ex.text for ex in examples]
    labels = [1 if ex.answer["is_important"] else 0 for ex in examples]
    template_ids = [ex.template_id for ex in examples]

    logger.info(
        "Dataset: %d examples (important=%d, not=%d, templates=%d)",
        len(labels),
        sum(labels),
        len(labels) - sum(labels),
        len(set(template_ids)),
    )

    train_idx, val_idx, test_idx = split_by_templates(
        template_ids,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
    )

    train_texts = [texts[i] for i in train_idx]
    train_labels = [labels[i] for i in train_idx]
    val_texts = [texts[i] for i in val_idx]
    val_labels = [labels[i] for i in val_idx]
    test_texts = [texts[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]

    logger.info(
        "Split by templates: Train=%d  Val=%d  Test=%d (hold-out)",
        len(train_labels),
        len(val_labels),
        len(test_labels),
    )

    train_ds = tokenize(tokenizer, train_texts, train_labels, args.max_len)
    val_ds = tokenize(tokenizer, val_texts, val_labels, args.max_len)

    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=2,
        id2label={0: "not_important", 1: "important"},
        label2id={"not_important": 0, "important": 1},
        cache_dir=CACHE_DIR,
        ignore_mismatched_sizes=True,
    )

    chosen = get_device(args.device)
    if args.device == "cuda" and not torch.cuda.is_available():
        logger.warning("--device cuda запрошен, но CUDA недоступна — переключаемся на CPU")

    if chosen == "cuda":
        device_label = f"GPU ({torch.cuda.get_device_name(0)})"
        use_fp16 = True
    elif chosen == "mps":
        device_label = "MPS (Apple Silicon)"
        use_fp16 = False
    else:
        device_label = "CPU"
        use_fp16 = False
    logger.info("Device: %s", device_label)

    # Датасет несбалансирован (75% important / 25% not). Веса обратно пропорциональны
    # частоте — компенсируют дисбаланс в CrossEntropy.
    n_total = len(train_labels)
    n_imp = sum(train_labels)
    n_not = n_total - n_imp
    class_weights = torch.tensor(
        [n_total / (2 * n_not), n_total / (2 * n_imp)],
        dtype=torch.float,
    )
    logger.info(
        "Class weights: not_important=%.3f  important=%.3f",
        class_weights[0].item(),
        class_weights[1].item(),
    )

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch * 2,
        learning_rate=args.lr,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        logging_steps=20,
        warmup_ratio=0.1,
        fp16=use_fp16,
        report_to="none",
    )

    class WeightedTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
            labels = inputs.pop("labels")
            outputs = model(**inputs)
            logits = outputs.logits
            loss = torch.nn.functional.cross_entropy(
                logits,
                labels,
                weight=class_weights.to(logits.device),
            )
            return (loss, outputs) if return_outputs else loss

    trainer = WeightedTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
    )

    logger.info("Training started...")
    trainer.train()

    logger.info("Saving model to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    metrics = trainer.evaluate()
    logger.info(
        "Val metrics: accuracy=%.4f  f1=%.4f",
        metrics["eval_accuracy"],
        metrics["eval_f1"],
    )

    if test_texts:
        test_ds = tokenize(tokenizer, test_texts, test_labels, args.max_len)
        test_metrics = trainer.evaluate(eval_dataset=test_ds, metric_key_prefix="test")
        logger.info(
            "Test metrics (hold-out): accuracy=%.4f  f1=%.4f",
            test_metrics["test_accuracy"],
            test_metrics["test_f1"],
        )

    logger.info("Done. Model saved to %s", OUTPUT_DIR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rubert-tiny2 importance classifier")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--max-len", type=int, default=256)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default=None)
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
