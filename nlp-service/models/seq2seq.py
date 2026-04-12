"""
TextProcessor — формализация текста и извлечение тезисов.

Базовая модель: cointegrated/rut5-base-multitask
  - 222 MB, обучена на русскоязычных задачах (суммаризация, перефразирование)
  - Один чекпоинт, два режима через prefix:
      "формализуй: {complaint}"  → formalized_text
      "тезисы: {complaint}"      → "- тезис1\n- тезис2\n..."

Состояния:
  - pretrained: базовая rut5 (даёт разумный результат без fine-tune)
  - finetuned:  загружена из TRAINED_DIR после train_seq2seq.py
"""

from __future__ import annotations

import logging
from pathlib import Path

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rut5-base-multitask"
TRAINED_DIR = Path(__file__).parent.parent / "trained_models" / "seq2seq"
CACHE_DIR = Path(__file__).parent.parent / "models_cache"


class TextProcessor:
    def __init__(self) -> None:
        self.tokenizer: AutoTokenizer | None = None
        self.model: T5ForConditionalGeneration | None = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.is_finetuned = False

    def load(self) -> None:
        """Загружает fine-tuned модель если есть, иначе базовую."""
        if TRAINED_DIR.exists() and (TRAINED_DIR / "config.json").exists():
            source = TRAINED_DIR
            self.is_finetuned = True
            logger.info("TextProcessor: loading fine-tuned model from %s", source)
        else:
            source = BASE_MODEL
            self.is_finetuned = False
            logger.warning(
                "TextProcessor: fine-tuned model not found, loading base %s. "
                "Run train_seq2seq.py for better results.",
                BASE_MODEL,
            )

        # T5Tokenizer напрямую — rut5 использует SentencePiece, AutoTokenizer тянет tiktoken
        self.tokenizer = T5Tokenizer.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model = T5ForConditionalGeneration.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model.to(self.device)
        self.model.eval()
        logger.info("TextProcessor ready on %s (finetuned=%s)", self.device, self.is_finetuned)

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
        """
        Формализует обращение: убирает эмоции, оставляет факты,
        приводит к нейтральному медицинскому стилю.
        """
        return self._generate(f"формализуй: {text}", max_new_tokens=150)

    def extract_theses(self, text: str) -> list[str]:
        """
        Извлекает краткие тезисы (3-7 слов каждый) из обращения.
        Возвращает список строк без маркеров.
        """
        raw = self._generate(f"тезисы: {text}", max_new_tokens=100)
        theses = []
        for line in raw.split("\n"):
            line = line.strip().lstrip("-•*·— ").strip()
            if line:
                theses.append(line)
        return theses or [text[:80]]  # fallback: первые 80 символов
