#!/usr/bin/env python3
"""Fine-tune rubert-base-cased-conversational на бинарную классификацию important/not_important.
Результат: trained_models/classifier/. CPU ~1.5ч, GPU ~15мин."""

import argparse
import logging
from typing import NamedTuple

import numpy as np
import torch
from sklearn.metrics import f1_score
from torch.utils.data import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from models import Example, get_device, load_examples, split_by_templates
from models.classifier import BASE_MODEL
from paths import CACHE_DIR, DATASET_PATH, TRAINED_CLASSIFIER_DIR

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = TRAINED_CLASSIFIER_DIR



class Split(NamedTuple):
    texts: list[str]
    labels: list[int]


def tokenize(tokenizer, split: Split, max_len: int) -> Dataset:
    encodings = tokenizer(
        split.texts,
        truncation=True,
        padding=True,
        max_length=max_len,
        return_tensors="pt",
    )

    class _DS(Dataset):
        def __len__(self):
            return len(split.labels)

        def __getitem__(self, idx):
            return {
                "input_ids": encodings["input_ids"][idx],
                "attention_mask": encodings["attention_mask"][idx],
                "labels": torch.tensor(split.labels[idx], dtype=torch.long),
            }

    return _DS()


def compute_metrics(eval_prediction):
    logits, labels = eval_prediction
    predictions = np.argmax(logits, axis=-1)
    return {
        "accuracy": float((predictions == labels).mean()),
        "f1": float(f1_score(labels, predictions, average="binary")),
    }


def build_splits(examples: list[Example], val_ratio: float, test_ratio: float) -> tuple[Split, Split, Split]:
    texts = [ex.text for ex in examples]
    labels = [1 if ex.answer["is_important"] else 0 for ex in examples]
    template_ids = [ex.template_id for ex in examples]

    logger.info(
        "Dataset: %d examples (important=%d, not=%d, templates=%d)",
        len(labels), sum(labels), len(labels) - sum(labels), len(set(template_ids)),
    )

    train_idx, val_idx, test_idx = split_by_templates(
        template_ids, val_ratio=val_ratio, test_ratio=test_ratio,
    )

    def take(idx: list[int]) -> Split:
        return Split(texts=[texts[i] for i in idx], labels=[labels[i] for i in idx])

    train, val, test = take(train_idx), take(val_idx), take(test_idx)
    logger.info(
        "Split by templates: Train=%d  Val=%d  Test=%d (hold-out)",
        len(train.labels), len(val.labels), len(test.labels),
    )
    return train, val, test


def class_weights(labels: list[int]) -> torch.Tensor:
    n = len(labels)
    n_pos = sum(labels)
    n_neg = n - n_pos
    return torch.tensor([n / (2 * n_neg), n / (2 * n_pos)], dtype=torch.float)


def device_info(requested: str | None) -> tuple[str, str, bool]:
    """Возвращает (device, human_label, use_fp16)."""
    chosen = get_device(requested)
    if requested == "cuda" and not torch.cuda.is_available():
        logger.warning("--device cuda запрошен, но CUDA недоступна — переключаемся на CPU")
    if chosen == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        return chosen, f"GPU ({gpu_name}, {gpu_mem_gb:.1f} GB, fp16)", True
    if chosen == "mps":
        return chosen, "MPS (Apple Silicon, fp32)", False
    return chosen, "CPU (fp32)", False


class WeightedTrainer(Trainer):
    def __init__(self, class_weights: torch.Tensor, **kwargs):
        super().__init__(**kwargs)
        self._class_weights = class_weights.to(next(self.model.parameters()).device)

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        loss = torch.nn.functional.cross_entropy(
            outputs.logits,
            labels,
            weight=self._class_weights,
            label_smoothing=self.args.label_smoothing_factor,
        )
        return (loss, outputs) if return_outputs else loss


def train(args: argparse.Namespace) -> None:
    logger.info("Loading tokenizer: %s", BASE_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    examples = load_examples(DATASET_PATH)
    train_split, val_split, test_split = build_splits(examples, args.val_ratio, args.test_ratio)

    train_dataset = tokenize(tokenizer, train_split, args.max_len)
    eval_dataset = tokenize(tokenizer, val_split, args.max_len)

    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=2,
        id2label={0: "not_important", 1: "important"},
        label2id={"not_important": 0, "important": 1},
        cache_dir=CACHE_DIR,
        ignore_mismatched_sizes=True,
    )

    device, device_label, use_fp16 = device_info(args.device)
    logger.info("Device: %s", device_label)

    weights = class_weights(train_split.labels)
    logger.info(
        "Class weights: not_important=%.3f  important=%.3f",
        weights[0].item(), weights[1].item(),
    )

    patience = min(args.patience, args.epochs - 1)
    trainer = WeightedTrainer(
        class_weights=weights,
        model=model,
        args=TrainingArguments(
            output_dir=str(OUTPUT_DIR),
            num_train_epochs=args.epochs,
            per_device_train_batch_size=args.batch,
            per_device_eval_batch_size=args.batch * 2,
            learning_rate=args.lr,
            weight_decay=0.01,
            label_smoothing_factor=args.label_smoothing,
            eval_strategy="epoch",
            save_strategy="epoch",
            load_best_model_at_end=True,
            metric_for_best_model="f1",
            logging_steps=20,
            warmup_ratio=0.1,
            fp16=use_fp16,
            use_cpu=(device == "cpu"),
            report_to="none",
        ),
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=patience)],
    )
    logger.info(
        "Regularization: label_smoothing=%.2f  early_stopping_patience=%d",
        args.label_smoothing, patience,
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

    val_metrics = trainer.evaluate()
    logger.info(
        "Val metrics: accuracy=%.4f  f1=%.4f",
        val_metrics["eval_accuracy"], val_metrics["eval_f1"],
    )

    if test_split.texts:
        test_dataset = tokenize(tokenizer, test_split, args.max_len)
        test_metrics = trainer.evaluate(eval_dataset=test_dataset, metric_key_prefix="test")
        logger.info(
            "Test metrics (hold-out): accuracy=%.4f  f1=%.4f",
            test_metrics["test_accuracy"], test_metrics["test_f1"],
        )

    logger.info("Done. Model saved to %s", OUTPUT_DIR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rubert-base-cased-conversational importance classifier")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--max-len", type=int, default=256)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--device", choices=["cpu", "cuda", "mps"], default=None)
    parser.add_argument("--label-smoothing", type=float, default=0.1,
                        help="Смягчение таргетов для борьбы с overconfidence (0.0–0.2)")
    parser.add_argument("--patience", type=int, default=1,
                        help="Early stopping: сколько эпох без улучшения F1 до остановки")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
