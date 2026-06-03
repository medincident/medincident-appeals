"""TextProcessor на rut5-base-multitask — formalize через prefix."""

from __future__ import annotations

import logging
import re

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

from models import get_device
from paths import CACHE_DIR, TRAINED_SEQ2SEQ_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rut5-base-multitask"

# Страховочный срез канцелярских зачинов на инференсе (на случай остаточных
# штампов в выводе модели). Канонический нормализатор — dataset/normalize.py;
# здесь автономная копия, чтобы сервис не зависел от пакета dataset в рантайме.
_BOILERPLATE_OPENERS = [
    r"зафиксирован[оаы]?",
    r"зарегистрирован[оаы]?",
    r"отмечен[оаы]?",
    r"отмечается(?:,?\s*что)?(?:\s+у\s+пациент(?:а|ки))?",
    r"выявлен[оаы]?",
    r"установлен[оаы]?",
    r"констатирован[оаы]?",
    r"пациент(?:ка)?\s+подаёт\s+сигнал(?:\s+бедствия)?",
    r"пациент(?:ка)?\s+сообщает(?:,?\s*что)?(?!\s+о\b|\s+об\b)",
    r"пациент(?:ка)?\s+заявляет(?:,?\s*что)?(?!\s+о\b|\s+об\b)",
    r"пациент(?:ка)?\s+обращается\s+с",
]
_BOILERPLATE_PAT = re.compile(r"^(?:%s)[\s:,]+" % "|".join(_BOILERPLATE_OPENERS), re.IGNORECASE)


def _strip_boilerplate(text: str) -> str:
    if not text:
        return text
    t = text.strip()
    while True:
        stripped = _BOILERPLATE_PAT.sub("", t).strip()
        if not stripped or stripped == t:
            break
        t = stripped
    return t[0].upper() + t[1:] if t else text


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

        self.tokenizer = T5Tokenizer.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model = T5ForConditionalGeneration.from_pretrained(
            source, cache_dir=CACHE_DIR if not self.is_finetuned else None
        )
        self.model.to(self.device)
        self.model.eval()
        # rut5 с generation_config.max_length=20; конфликтует с max_new_tokens
        self.model.generation_config.max_length = None
        self.model.config.max_length = None
        logger.info(
            "TextProcessor ready on %s (finetuned=%s)",
            self.device,
            self.is_finetuned,
        )

    def _generate(self, prompt: str, max_new_tokens: int = 80) -> str:
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
                # repetition_penalty подавляет зацикливания вида "болит нога ... упала нога"
                # и "с помощью помощи"; min_new_tokens не даёт обрезать слишком рано.
                repetition_penalty=1.3,
                min_new_tokens=6,
            )

        return self.tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    def formalize(self, text: str) -> str:
        return _strip_boilerplate(self._generate(f"формализуй: {text}", max_new_tokens=80))
