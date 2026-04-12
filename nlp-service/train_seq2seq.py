#!/usr/bin/env python3
"""
train_seq2seq.py — fine-tune rut5-base-multitask для формализации и тезисов.

Одна модель, два режима обучения через prefix:
  "формализуй: {complaint}"  →  formalized_text
  "тезисы: {complaint}"      →  "- тезис1\n- тезис2\n..."

Датасет: ../dataset.jsonl
  Из каждого примера берём:
    input_formalize = "формализуй: " + user_text
    target_formalize = formalized_text из assistant JSON
    input_theses    = "тезисы: "     + user_text
    target_theses   = "- тезис1\n- тезис2\n..." (из theses[])

  Только важные примеры (is_important=true) — неважным нет что формализовать.
  Итого ~2700 × 2 = ~5400 пар.

Гиперпараметры:
  --epochs     5
  --lr         5e-5   (выше чем для BERT — T5 лучше принимает)
  --batch      16     (уменьшить до 8 при нехватке памяти)
  --max-src    256
  --max-tgt    128

Результат: ./trained_models/seq2seq/
  TextProcessor.load() подхватит автоматически.

Время обучения (~5400 пар):
  CPU: ~60 мин
  GPU: ~8 мин
"""

import argparse
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATASET_PATH = Path(__file__).parent.parent / "dataset.jsonl"
OUTPUT_DIR = Path(__file__).parent / "trained_models" / "seq2seq"
CACHE_DIR = Path(__file__).parent / "models_cache"
BASE_MODEL = "cointegrated/rut5-base-multitask"


# ── загрузка датасета ─────────────────────────────────────────────────────────

def load_pairs(path: Path) -> tuple[list[str], list[str]]:
    """
    Возвращает (inputs, targets) — чередуем формализацию и тезисы,
    чтобы модель обучалась на обоих задачах в одном прогоне.
    """
    inputs, targets = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            msgs = ex["messages"]
            complaint = msgs[0]["content"]
            answer = json.loads(msgs[1]["content"])
            if not answer["is_important"]:
                continue

            formalized = answer.get("formalized_text", "").strip()
            theses = answer.get("theses") or []
            theses_str = "\n".join(f"- {t}" for t in theses)

            if formalized:
                inputs.append(f"формализуй: {complaint}")
                targets.append(formalized)

            if theses_str:
                inputs.append(f"тезисы: {complaint}")
                targets.append(theses_str)

    logger.info("Loaded %d input-target pairs", len(inputs))
    return inputs, targets


# ── датасет PyTorch ───────────────────────────────────────────────────────────

def make_dataset(tokenizer, inputs: list[str], targets: list[str],
                 max_src: int, max_tgt: int):
    from torch.utils.data import Dataset

    # Токенизируем без паддинга — DataCollatorForSeq2Seq западдит каждый батч
    # до максимальной длины внутри него (экономит память и убирает numpy-конфликт)
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


# ── метрики ───────────────────────────────────────────────────────────────────

def compute_metrics(eval_pred):
    """Приближённая оценка: доля одинаковых токенов (token accuracy)."""
    import numpy as np

    preds, labels = eval_pred
    if isinstance(preds, tuple):
        preds = preds[0]
    # argmax по logits
    pred_ids = np.argmax(preds, axis=-1)
    mask = labels != -100
    correct = (pred_ids == labels) & mask
    token_acc = correct.sum() / mask.sum() if mask.sum() > 0 else 0.0
    return {"token_accuracy": float(token_acc)}


# ── обучение ──────────────────────────────────────────────────────────────────

def train(args: argparse.Namespace) -> None:
    import numpy as np
    from transformers import (
        DataCollatorForSeq2Seq,
        Seq2SeqTrainer,
        Seq2SeqTrainingArguments,
        T5ForConditionalGeneration,
        T5Tokenizer,
    )

    logger.info("Loading tokenizer: %s", BASE_MODEL)
    tokenizer = T5Tokenizer.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

    all_inputs, all_targets = load_pairs(DATASET_PATH)

    # train/val split
    n = len(all_inputs)
    n_val = max(int(n * 0.1), 50)
    rng = np.random.default_rng(42)
    idx = rng.permutation(n)
    val_idx, train_idx = idx[:n_val], idx[n_val:]

    train_inputs  = [all_inputs[i]  for i in train_idx]
    train_targets = [all_targets[i] for i in train_idx]
    val_inputs    = [all_inputs[i]  for i in val_idx]
    val_targets   = [all_targets[i] for i in val_idx]

    logger.info("Train pairs: %d  Val pairs: %d", len(train_inputs), len(val_inputs))

    train_ds = make_dataset(tokenizer, train_inputs, train_targets, args.max_src, args.max_tgt)
    val_ds   = make_dataset(tokenizer, val_inputs,   val_targets,   args.max_src, args.max_tgt)

    logger.info("Loading model: %s", BASE_MODEL)
    model = T5ForConditionalGeneration.from_pretrained(BASE_MODEL, cache_dir=CACHE_DIR)

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
        metric_for_best_model="token_accuracy",
        predict_with_generate=False,  # teacher forcing — eval в 10x быстрее на CPU
        logging_steps=50,
        warmup_ratio=0.05,
        fp16=False,   # CPU-safe; включить если есть GPU
        report_to="none",
    )

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=collator,
        compute_metrics=compute_metrics,
    )

    logger.info("Training started...")
    trainer.train()

    logger.info("Saving model to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    metrics = trainer.evaluate()
    logger.info("Final token_accuracy: %.4f", metrics.get("eval_token_accuracy", 0))
    logger.info("Done. Model saved to %s", OUTPUT_DIR)


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rut5 for formalization + theses")
    parser.add_argument("--epochs",  type=int,   default=5,    help="Число эпох (default: 5)")
    parser.add_argument("--lr",      type=float, default=5e-5, help="Learning rate (default: 5e-5)")
    parser.add_argument("--batch",   type=int,   default=16,   help="Batch size (default: 16)")
    parser.add_argument("--max-src", type=int,   default=128,  help="Max source length (default: 128)")
    parser.add_argument("--max-tgt", type=int,   default=64,   help="Max target length (default: 64)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
