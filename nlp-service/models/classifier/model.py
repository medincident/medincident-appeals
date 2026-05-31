"""ImportanceClassifier на rubert-base-cased-conversational — бинарная классификация важности обращения."""

from __future__ import annotations

import logging

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from models import get_device
from paths import CACHE_DIR, TRAINED_CLASSIFIER_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rubert-tiny2"
ID2LABEL = {0: "not_important", 1: "important"}
LABEL2ID = {v: k for k, v in ID2LABEL.items()}


class ImportanceClassifier:
    def __init__(self) -> None:
        self.tokenizer: AutoTokenizer | None = None
        self.model: AutoModelForSequenceClassification | None = None
        self.device = get_device()
        self.is_finetuned = False

    def load(self) -> None:
        if TRAINED_CLASSIFIER_DIR.exists() and (TRAINED_CLASSIFIER_DIR / "config.json").exists():
            source = TRAINED_CLASSIFIER_DIR
            self.is_finetuned = True
            logger.info("ImportanceClassifier: loading fine-tuned model from %s", source)
        else:
            source = BASE_MODEL
            self.is_finetuned = False
            logger.warning(
                "ImportanceClassifier: fine-tuned model not found, loading base %s. "
                "Run models/classifier/train.py for better accuracy.",
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
        logger.info(
            "ImportanceClassifier ready on %s (finetuned=%s)",
            self.device,
            self.is_finetuned,
        )

    def predict(self, text: str) -> tuple[bool, float]:
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
