"""TextProcessor на rut5-base-multitask — formalize + extract_theses через prefix'ы."""

from __future__ import annotations

import logging

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

from models import get_device
from paths import CACHE_DIR, TRAINED_SEQ2SEQ_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rut5-base-multitask"


class TextProcessor:
    def __init__(self) -> None:
        self.tokenizer: T5Tokenizer | None = None
        self.model: T5ForConditionalGeneration | None = None
        self.device = get_device()
        self.is_finetuned = False

    def load(self) -> None:
        if TRAINED_SEQ2SEQ_DIR.exists() and (TRAINED_SEQ2SEQ_DIR / "config.json").exists():
            source = TRAINED_SEQ2SEQ_DIR
            self.is_finetuned = True
            logger.info("TextProcessor: loading fine-tuned model from %s", source)
        else:
            source = BASE_MODEL
            self.is_finetuned = False
            logger.warning(
                "TextProcessor: fine-tuned model not found, loading base %s. "
                "Run models/seq2seq/train.py for better results.",
                BASE_MODEL,
            )

        # rut5 использует SentencePiece. AutoTokenizer тянул бы лишний tiktoken —
        # берём T5Tokenizer напрямую.
        self.tokenizer = T5Tokenizer.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model = T5ForConditionalGeneration.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model.to(self.device)
        self.model.eval()
        # rut5 приносит с собой generation_config.max_length=20 — конфликтует
        # с нашим max_new_tokens при generate(). Сбрасываем оба.
        self.model.generation_config.max_length = None
        self.model.config.max_length = None
        logger.info(
            "TextProcessor ready on %s (finetuned=%s)",
            self.device,
            self.is_finetuned,
        )

    def _generate(self, prompt: str, max_new_tokens: int = 128) -> str:
        assert self.model is not None, "Call load() first"

        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=512,
        ).to(self.device)

        with torch.no_grad():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                num_beams=4,
                early_stopping=True,
                no_repeat_ngram_size=3,
            )

        return self.tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    def formalize(self, text: str) -> str:
        return self._generate(f"формализуй: {text}", max_new_tokens=150)

    def extract_theses(self, text: str) -> list[str]:
        raw = self._generate(f"тезисы: {text}", max_new_tokens=100)
        theses = []
        for line in raw.split("\n"):
            line = line.strip().lstrip("-•*·— ").strip()
            if line:
                theses.append(line)
        return theses or [text[:80]]
