"""
ImportanceClassifier — бинарная классификация обращений.

Базовая модель: cointegrated/rubert-tiny2
  - 29 MB, работает на CPU в реальном времени (~50ms/запрос)
  - После fine-tune на dataset.jsonl точность ~95%+

Состояния модели:
  - pretrained: базовая rubert-tiny2 без fine-tune (слабая для нашей задачи)
  - finetuned:  загружена из TRAINED_DIR после train_classifier.py
"""

from __future__ import annotations

import logging
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rubert-tiny2"
TRAINED_DIR = Path(__file__).parent.parent / "trained_models" / "classifier"
CACHE_DIR = Path(__file__).parent.parent / "models_cache"

# Метки: 0 = not_important, 1 = important
ID2LABEL = {0: "not_important", 1: "important"}
LABEL2ID = {"not_important": 0, "important": 1}


class ImportanceClassifier:
    def __init__(self) -> None:
        self.tokenizer: AutoTokenizer | None = None
        self.model: AutoModelForSequenceClassification | None = None
        if torch.cuda.is_available():
            self.device = "cuda"
        elif torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
        self.is_finetuned = False

    def load(self) -> None:
        """Загружает fine-tuned модель если есть, иначе базовую."""
        if TRAINED_DIR.exists() and (TRAINED_DIR / "config.json").exists():
            source = TRAINED_DIR
            self.is_finetuned = True
            logger.info("ImportanceClassifier: loading fine-tuned model from %s", source)
        else:
            source = BASE_MODEL
            self.is_finetuned = False
            logger.warning(
                "ImportanceClassifier: fine-tuned model not found, loading base %s. "
                "Run train_classifier.py for better accuracy.",
                BASE_MODEL,
            )

        self.tokenizer = AutoTokenizer.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model = AutoModelForSequenceClassification.from_pretrained(
            source,
            num_labels=2,
            id2label=ID2LABEL,
            label2id=LABEL2ID,
            cache_dir=CACHE_DIR if not self.is_finetuned else None,
            ignore_mismatched_sizes=True,
        )
        self.model.to(self.device)
        self.model.eval()
        logger.info("ImportanceClassifier ready on %s (finetuned=%s)", self.device, self.is_finetuned)

    def predict(self, text: str) -> tuple[bool, float]:
        """
        Возвращает (is_important, confidence).
        confidence — вероятность predicted класса [0.0, 1.0].
        """
        assert self.model is not None, "Call load() first"

        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        ).to(self.device)

        with torch.no_grad():
            logits = self.model(**inputs).logits

        probs = torch.softmax(logits, dim=-1).squeeze()
        label_id = int(probs.argmax())
        confidence = float(probs[label_id])
        is_important = label_id == LABEL2ID["important"]

        return is_important, confidence
