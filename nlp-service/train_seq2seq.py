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
  Итого ~2250 × 2 = ~4500 пар.

Split по шаблонам (template_id), не по примерам — предотвращает data leakage.
  70% шаблонов → train, 15% → val, 15% → test (hold-out).

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

def load_pairs(path: Path) -> tuple[list[str], list[str], list[str]]:
    """
    Возвращает (inputs, targets, template_ids) — чередуем формализацию и тезисы.
    template_id нужен для split по шаблонам (предотвращение data leakage).
    """
    inputs, targets, template_ids = [], [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line.strip())
            msgs = ex["messages"]
            complaint = msgs[0]["content"]
            answer = json.loads(msgs[1]["content"])
            if not answer["is_important"]:
                continue

            tid = ex.get("template_id", f"unknown_{len(inputs)}")
            formalized = answer.get("formalized_text", "").strip()
            theses = answer.get("theses") or []
            theses_str = "\n".join(f"- {t}" for t in theses)

            if formalized:
                inputs.append(f"формализуй: {complaint}")
                targets.append(formalized)
                template_ids.append(tid)

            if theses_str:
                inputs.append(f"тезисы: {complaint}")
                targets.append(theses_str)
                template_ids.append(tid)

    logger.info("Loaded %d input-target pairs (templates=%d)",
                len(inputs), len(set(template_ids)))
    return inputs, targets, template_ids


def split_by_templates(
    template_ids: list[str],
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
) -> tuple[list[int], list[int], list[int]]:
    """Split по шаблонам: все пары одного шаблона попадают в один сплит."""
    import numpy as np

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

def make_compute_metrics(tokenizer, use_bertscore: bool = False):
    """Фабрика compute_metrics с доступом к tokenizer через замыкание.

    Args:
        tokenizer: T5Tokenizer для декодирования token IDs в текст.
        use_bertscore: считать BERTScore (медленно на CPU, ~2-5с/батч).
            Рекомендуется включать только для финальной оценки.
    """
    from rouge_score import rouge_scorer, scoring

    # rouge_score по умолчанию не поддерживает кириллицу — нужен tokenizer по пробелам
    class _WhitespaceTokenizer:
        """Токенизатор по пробелам для русского текста."""
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

        # Заменяем -100 на pad_token_id для корректного декодирования
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)

        decoded_preds = tokenizer.batch_decode(preds, skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

        # ROUGE
        r1_scores, r2_scores, rl_scores = [], [], []
        for pred, ref in zip(decoded_preds, decoded_labels):
            scores = scorer.score(ref.strip(), pred.strip())
            r1_scores.append(scores["rouge1"].fmeasure)
            r2_scores.append(scores["rouge2"].fmeasure)
            rl_scores.append(scores["rougeL"].fmeasure)

        result = {
            "rouge1": float(np.mean(r1_scores)),
            "rouge2": float(np.mean(r2_scores)),
            "rougeL": float(np.mean(rl_scores)),
        }

        # BERTScore (опционально — медленный на CPU)
        if use_bertscore:
            from bert_score import score as bert_score_fn
            _, _, f1 = bert_score_fn(
                decoded_preds, decoded_labels,
                lang="ru", verbose=False,
            )
            result["bertscore_f1"] = float(f1.mean())

        return result

    return compute_metrics


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

    all_inputs, all_targets, all_tids = load_pairs(DATASET_PATH)

    # split по шаблонам (не по парам) — предотвращает data leakage
    train_idx, val_idx, test_idx = split_by_templates(
        all_tids, val_ratio=args.val_ratio, test_ratio=args.test_ratio,
    )

    train_inputs  = [all_inputs[i]  for i in train_idx]
    train_targets = [all_targets[i] for i in train_idx]
    val_inputs    = [all_inputs[i]  for i in val_idx]
    val_targets   = [all_targets[i] for i in val_idx]
    test_inputs   = [all_inputs[i]  for i in test_idx]
    test_targets  = [all_targets[i] for i in test_idx]

    logger.info("Split by templates: Train=%d  Val=%d  Test=%d (hold-out)",
                len(train_inputs), len(val_inputs), len(test_inputs))

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
        metric_for_best_model="rouge1",
        predict_with_generate=True,
        generation_max_length=args.max_tgt,
        generation_num_beams=4,
        logging_steps=50,
        warmup_ratio=0.05,
        fp16=False,   # CPU-safe; включить если есть GPU
        report_to="none",
    )

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, padding=True)

    # ROUGE на каждую эпоху, BERTScore только при финальной оценке (медленный на CPU)
    epoch_metrics_fn = make_compute_metrics(tokenizer, use_bertscore=False)

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=collator,
        compute_metrics=epoch_metrics_fn,
    )

    logger.info("Training started...")
    trainer.train()

    logger.info("Saving model to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    # финальная оценка с BERTScore (на val)
    final_metrics_fn = make_compute_metrics(tokenizer, use_bertscore=True)
    trainer.compute_metrics = final_metrics_fn

    metrics = trainer.evaluate()
    logger.info("Val metrics: ROUGE-1=%.4f  ROUGE-2=%.4f  ROUGE-L=%.4f  BERTScore-F1=%.4f",
                metrics.get("eval_rouge1", 0), metrics.get("eval_rouge2", 0),
                metrics.get("eval_rougeL", 0), metrics.get("eval_bertscore_f1", 0))

    # оценка на test (hold-out) — если есть
    if test_inputs:
        test_ds = make_dataset(tokenizer, test_inputs, test_targets, args.max_src, args.max_tgt)
        test_metrics = trainer.evaluate(eval_dataset=test_ds, metric_key_prefix="test")
        logger.info("Test metrics (hold-out): ROUGE-1=%.4f  ROUGE-2=%.4f  ROUGE-L=%.4f  BERTScore-F1=%.4f",
                    test_metrics.get("test_rouge1", 0), test_metrics.get("test_rouge2", 0),
                    test_metrics.get("test_rougeL", 0), test_metrics.get("test_bertscore_f1", 0))

    logger.info("Done. Model saved to %s", OUTPUT_DIR)


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune rut5 for formalization + theses")
    parser.add_argument("--epochs",  type=int,   default=5,    help="Число эпох (default: 5)")
    parser.add_argument("--lr",      type=float, default=5e-5, help="Learning rate (default: 5e-5)")
    parser.add_argument("--batch",   type=int,   default=16,   help="Batch size (default: 16)")
    parser.add_argument("--max-src",    type=int,   default=128,  help="Max source length (default: 128)")
    parser.add_argument("--max-tgt",    type=int,   default=64,   help="Max target length (default: 64)")
    parser.add_argument("--val-ratio",  type=float, default=0.15, help="Val template ratio (default: 0.15)")
    parser.add_argument("--test-ratio", type=float, default=0.15, help="Test template ratio (default: 0.15)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    train(args)


if __name__ == "__main__":
    main()
