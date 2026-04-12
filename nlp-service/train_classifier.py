#!/usr/bin/env python3
"""
train_classifier.py — fine-tune rubert-tiny2 для классификации важности обращений.

Задача: бинарная классификация
  0 = not_important  (тестовые, благодарности, организационные вопросы)
  1 = important      (жалобы на здоровье, условия, персонал)

Датасет: ../dataset.jsonl (3000 примеров, 90% важных / 10% неважных)
  Формат: {"messages": [{"role": "user", ...}, {"role": "assistant", ...}]}
  Метка берётся из assistant JSON: is_important: true/false

Гиперпараметры (разумные defaults, можно менять через аргументы):
  --epochs     3       (достаточно для такого датасета)
  --lr         2e-5    (стандарт для BERT-like)
  --batch      32      (уменьшить до 16 при нехватке памяти)
  --max-len    256     (жалобы короткие, 512 избыточно)
  --val-split  0.15

Результат: сохраняется в ./trained_models/classifier/
  Затем ImportanceClassifier.load() подхватит автоматически.

Время обучения:
  CPU: ~20 мин
  GPU: ~3 мин
"""

import argparse
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH = Path(__file__).parent.parent / "dataset.jsonl"
OUTPUT_DIR = Path(__file__).parent / "trained_models" / "classifier"
CACHE_DIR = Path(__file__).parent / "models_cache"
BASE_MODEL = "cointegrated/rubert-tiny2"


# ── загрузка датасета ─────────────────────────────────────────────────────────

def load_dataset(path: Path) -> tuple[list[str], list[int]]:
    texts, labels = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            msgs = ex["messages"]
            text = msgs[0]["content"]          # user message = жалоба
            answer = json.loads(msgs[1]["content"])
            label = 1 if answer["is_important"] else 0
            texts.append(text)
            labels.append(label)
    logger.info("Loaded %d examples (important=%d, not=%d)",
                len(labels), sum(labels), len(labels) - sum(labels))
    return texts, labels


# ── токенизация ───────────────────────────────────────────────────────────────

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


# ── метрики ───────────────────────────────────────────────────────────────────

def compute_metrics(eval_pred):
    from sklearn.metrics import f1_score
    import numpy as np

    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    f1 = f1_score(labels, preds, average="binary")
    acc = (preds == labels).mean()
    return {"accuracy": float(acc), "f1": float(f1)}


# ── обучение ──────────────────────────────────────────────────────────────────

def train(args: argparse.Namespace) -> None:
    import numpy as np
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    logger.info("Loading tokenizer: %s", BASE_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    texts, labels = load_dataset(DATASET_PATH)

    # train/val split
    n = len(texts)
    n_val = int(n * args.val_split)
    rng = np.random.default_rng(42)
    idx = rng.permutation(n)
    val_idx, train_idx = idx[:n_val], idx[n_val:]

    train_texts = [texts[i] for i in train_idx]
    train_labels = [labels[i] for i in train_idx]
    val_texts = [texts[i] for i in val_idx]
    val_labels = [labels[i] for i in val_idx]

    logger.info("Train: %d  Val: %d", len(train_labels), len(val_labels))

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
        fp16=False,   # CPU-safe; включить если есть GPU
        report_to="none",
    )

    trainer = Trainer(
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

    # финальная оценка
    metrics = trainer.evaluate()
    logger.info("Final metrics: accuracy=%.4f  f1=%.4f",
                metrics["eval_accuracy"], metrics["eval_f1"])
    logger.info("Done. Model saved to %s", OUTPUT_DIR)


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rubert-tiny2 importance classifier")
    parser.add_argument("--epochs",    type=int,   default=3,    help="Число эпох (default: 3)")
    parser.add_argument("--lr",        type=float, default=2e-5, help="Learning rate (default: 2e-5)")
    parser.add_argument("--batch",     type=int,   default=32,   help="Batch size (default: 32)")
    parser.add_argument("--max-len",   type=int,   default=256,  help="Max token length (default: 256)")
    parser.add_argument("--val-split", type=float, default=0.15, help="Validation split (default: 0.15)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
