#!/usr/bin/env python3
"""
train_classifier.py — fine-tune rubert-tiny2 для классификации важности обращений.

Задача: бинарная классификация
  0 = not_important  (тестовые, благодарности, организационные вопросы)
  1 = important      (жалобы на здоровье, условия, персонал)

Датасет: ../dataset.jsonl (3000 примеров, 75% важных / 25% неважных)
  Формат: {"messages": [...], "template_id": "imp_42"}
  Метка берётся из assistant JSON: is_important: true/false

Split по шаблонам (template_id), не по примерам — предотвращает data leakage.
  70% шаблонов → train, 15% → val, 15% → test (hold-out).

Гиперпараметры (разумные defaults, можно менять через аргументы):
  --epochs     3       (достаточно для такого датасета)
  --lr         2e-5    (стандарт для BERT-like)
  --batch      32      (уменьшить до 16 при нехватке памяти)
  --max-len    256     (жалобы короткие, 512 избыточно)
  --val-ratio  0.15
  --test-ratio 0.15

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

def load_dataset(path: Path) -> tuple[list[str], list[int], list[str]]:
    texts, labels, template_ids = [], [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            msgs = ex["messages"]
            text = msgs[0]["content"]          # user message = жалоба
            answer = json.loads(msgs[1]["content"])
            label = 1 if answer["is_important"] else 0
            texts.append(text)
            labels.append(label)
            template_ids.append(ex.get("template_id", f"unknown_{len(texts)}"))
    logger.info("Loaded %d examples (important=%d, not=%d, templates=%d)",
                len(labels), sum(labels), len(labels) - sum(labels),
                len(set(template_ids)))
    return texts, labels, template_ids


def split_by_templates(
    template_ids: list[str],
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[int], list[int], list[int]]:
    """Split по шаблонам: все вариации одного шаблона попадают в один сплит."""
    import numpy as np

    # Группируем индексы по template_id
    tid_to_indices: dict[str, list[int]] = {}
    for i, tid in enumerate(template_ids):
        tid_to_indices.setdefault(tid, []).append(i)

    unique_tids = list(tid_to_indices.keys())
    rng = np.random.default_rng(seed)
    rng.shuffle(unique_tids)

    n = len(unique_tids)
    n_val = int(n * val_ratio)
    n_test = int(n * test_ratio)

    val_tids = set(unique_tids[:n_val])
    test_tids = set(unique_tids[n_val:n_val + n_test])

    train_idx, val_idx, test_idx = [], [], []
    for tid, indices in tid_to_indices.items():
        if tid in val_tids:
            val_idx.extend(indices)
        elif tid in test_tids:
            test_idx.extend(indices)
        else:
            train_idx.extend(indices)

    return train_idx, val_idx, test_idx


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

    texts, labels, template_ids = load_dataset(DATASET_PATH)

    # split по шаблонам (не по примерам) — предотвращает data leakage
    train_idx, val_idx, test_idx = split_by_templates(
        template_ids, val_ratio=args.val_ratio, test_ratio=args.test_ratio,
    )

    train_texts = [texts[i] for i in train_idx]
    train_labels = [labels[i] for i in train_idx]
    val_texts = [texts[i] for i in val_idx]
    val_labels = [labels[i] for i in val_idx]
    test_texts = [texts[i] for i in test_idx]
    test_labels = [labels[i] for i in test_idx]

    logger.info("Split by templates: Train=%d  Val=%d  Test=%d (hold-out)",
                len(train_labels), len(val_labels), len(test_labels))

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

    # финальная оценка на val
    metrics = trainer.evaluate()
    logger.info("Val metrics: accuracy=%.4f  f1=%.4f",
                metrics["eval_accuracy"], metrics["eval_f1"])

    # оценка на test (hold-out) — если есть
    if test_texts:
        test_ds = tokenize(tokenizer, test_texts, test_labels, args.max_len)
        test_metrics = trainer.evaluate(eval_dataset=test_ds, metric_key_prefix="test")
        logger.info("Test metrics (hold-out): accuracy=%.4f  f1=%.4f",
                    test_metrics["test_accuracy"], test_metrics["test_f1"])

    logger.info("Done. Model saved to %s", OUTPUT_DIR)


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rubert-tiny2 importance classifier")
    parser.add_argument("--epochs",    type=int,   default=3,    help="Число эпох (default: 3)")
    parser.add_argument("--lr",        type=float, default=2e-5, help="Learning rate (default: 2e-5)")
    parser.add_argument("--batch",     type=int,   default=32,   help="Batch size (default: 32)")
    parser.add_argument("--max-len",   type=int,   default=256,  help="Max token length (default: 256)")
    parser.add_argument("--val-ratio",  type=float, default=0.15, help="Val template ratio (default: 0.15)")
    parser.add_argument("--test-ratio", type=float, default=0.15, help="Test template ratio (default: 0.15)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
