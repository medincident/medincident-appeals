"""TextProcessor на rut5-base-multitask — formalize + extract_theses через prefix'ы."""

from __future__ import annotations

import logging
import re

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

from models import get_device
from paths import CACHE_DIR, TRAINED_SEQ2SEQ_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "cointegrated/rut5-base-multitask"

# Пороги для валидации сгенерированных тезисов. На OOD/шумном входе T5
# вырождается в копию исходника либо формализации — отсекаем такое post-hoc.
_MIN_THESIS_WORDS = 2
_MAX_THESIS_CHARS = 120
_MAX_ORIGINAL_OVERLAP = 0.7   # >70% 3-gram совпадения с оригиналом → копия
_MAX_FORMALIZED_OVERLAP = 0.8  # >80% с формализацией → не добавляет инфы

_TOKEN_RE = re.compile(r"[^\w]+", flags=re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.split(text.lower()) if t]


def _ngrams(tokens: list[str], n: int) -> set[tuple[str, ...]]:
    if len(tokens) < n:
        return {tuple(tokens)} if tokens else set()
    return {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def _ngram_containment(thesis: str, reference: str, n: int = 3) -> float:
    """Доля 3-грамм тезиса, присутствующих в reference. 1.0 = тезис полностью
    содержится в reference (копия)."""
    t_grams = _ngrams(_tokenize(thesis), n)
    if not t_grams:
        return 0.0
    r_grams = _ngrams(_tokenize(reference), n)
    return len(t_grams & r_grams) / len(t_grams)


def _is_valid_thesis(thesis: str, original: str, formalized: str | None) -> bool:
    words = _tokenize(thesis)
    if len(words) < _MIN_THESIS_WORDS or len(thesis) > _MAX_THESIS_CHARS:
        return False
    if _ngram_containment(thesis, original) > _MAX_ORIGINAL_OVERLAP:
        return False
    if formalized and _ngram_containment(thesis, formalized) > _MAX_FORMALIZED_OVERLAP:
        return False
    return True


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

    def extract_theses(self, text: str, formalized: str | None = None) -> list[str]:
        raw = self._generate(f"тезисы: {text}", max_new_tokens=100)
        theses = []
        for line in raw.split("\n"):
            line = line.strip().lstrip("-•*·— ").strip()
            if line:
                theses.append(line)
        return [t for t in theses if _is_valid_thesis(t, text, formalized)]
