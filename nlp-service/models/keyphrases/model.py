"""MedicalKeyphraseExtractor — извлечение медицински значимых фраз из текста жалобы.

Работает zero-shot на MiniLM:
1. Кандидаты — клаузы (по запятым/точкам) и n-граммы 1-3 слов.
2. Фильтр — cosine similarity с набором медицинских концептов (анкоры).
3. MMR для разнообразия — убираем почти-дубликаты.

Модель MiniLM можно переиспользовать из CategoryMatcher, чтобы не грузить её дважды.
"""

from __future__ import annotations

import logging
import re

import numpy as np
from sentence_transformers import SentenceTransformer

from models import get_device
from paths import CACHE_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# Медицинские анкорные концепты: фраза-кандидат считается релевантной,
# если косинус с любым анкором превышает порог.
MEDICAL_ANCHORS = [
    "симптом болезни",
    "боль в теле",
    "травма пациента",
    "падение пациента",
    "кровотечение",
    "аллергическая реакция",
    "нарушение дыхания",
    "потеря сознания",
    "медицинская процедура",
    "приём лекарств",
    "послеоперационное осложнение",
    "жалоба на состояние здоровья",
    "отсутствие медицинской помощи",
    "неправильная манипуляция персонала",
]

# Русские стоп-слова (минимальный набор для извлечения).
STOPWORDS = frozenset(
    {
        "и", "в", "на", "с", "по", "к", "у", "о", "об", "от", "до", "из", "за",
        "для", "при", "про", "без", "под", "над", "через", "а", "но", "да",
        "или", "либо", "же", "бы", "не", "ни", "как", "что", "это", "этот",
        "эта", "эти", "тот", "та", "те", "я", "ты", "он", "она", "они", "мы",
        "вы", "меня", "тебя", "его", "её", "их", "нас", "вас", "мне", "тебе",
        "ему", "ей", "им", "очень", "так", "уже", "ещё", "еще", "только",
        "когда", "где", "куда", "почему", "если", "чтобы", "потому", "ведь",
        "хотя", "мой", "моя", "мои", "твой", "свой", "один", "одна", "одно",
        "был", "была", "было", "были", "есть", "быть",
    }
)

_WORD_RE = re.compile(r"[а-яёa-z0-9]+", re.IGNORECASE)
_CLAUSE_SPLIT_RE = re.compile(r"[,.!?;:\n]+")


def _tokenize(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def _generate_candidates(text: str, max_n: int = 3) -> list[str]:
    """Кандидаты = клаузы + n-граммы 1..max_n, с фильтрацией стоп-слов."""
    candidates: set[str] = set()

    for clause in _CLAUSE_SPLIT_RE.split(text):
        clause = clause.strip()
        if not clause:
            continue
        tokens = _tokenize(clause)
        if not tokens:
            continue

        if 1 <= len(tokens) <= 5:
            candidates.add(" ".join(tokens))

        for n in range(1, min(max_n, len(tokens)) + 1):
            for i in range(len(tokens) - n + 1):
                ngram_tokens = tokens[i : i + n]
                if all(t in STOPWORDS for t in ngram_tokens):
                    continue
                if ngram_tokens[0] in STOPWORDS or ngram_tokens[-1] in STOPWORDS:
                    continue
                candidates.add(" ".join(ngram_tokens))

    return sorted(candidates)


class MedicalKeyphraseExtractor:
    def __init__(self, shared_model: SentenceTransformer | None = None) -> None:
        self.model: SentenceTransformer | None = shared_model
        self.device = get_device()
        self._owns_model = shared_model is None
        self._anchor_embeddings: np.ndarray | None = None

    def load(self) -> None:
        if self.model is None:
            logger.info("MedicalKeyphraseExtractor: loading %s on %s", BASE_MODEL, self.device)
            self.model = SentenceTransformer(
                BASE_MODEL, cache_folder=str(CACHE_DIR), device=self.device
            )

        self._anchor_embeddings = self.model.encode(
            MEDICAL_ANCHORS, normalize_embeddings=True, show_progress_bar=False
        )
        logger.info(
            "MedicalKeyphraseExtractor ready (anchors=%d, owns_model=%s)",
            len(MEDICAL_ANCHORS),
            self._owns_model,
        )

    def extract(
        self,
        text: str,
        top_k: int = 5,
        relevance_threshold: float = 0.35,
        diversity_lambda: float = 0.7,
    ) -> list[tuple[str, float]]:
        """Возвращает список (фраза, score) отсортированный по убыванию релевантности.

        relevance_threshold — минимальный cosine с любым анкором (0.35 подобран эмпирически).
        diversity_lambda — баланс MMR: 1.0 = только релевантность, 0.0 = только разнообразие.
        """
        assert self.model is not None and self._anchor_embeddings is not None, "Call load() first"

        candidates = _generate_candidates(text)
        if not candidates:
            return []

        cand_embeddings = self.model.encode(
            candidates, normalize_embeddings=True, show_progress_bar=False
        )

        relevance = (cand_embeddings @ self._anchor_embeddings.T).max(axis=1)

        keep_mask = relevance >= relevance_threshold
        if not keep_mask.any():
            return []

        filtered_candidates = [c for c, k in zip(candidates, keep_mask) if k]
        filtered_embeddings = cand_embeddings[keep_mask]
        filtered_relevance = relevance[keep_mask]

        return self._mmr(
            filtered_candidates,
            filtered_embeddings,
            filtered_relevance,
            top_k=top_k,
            lambda_param=diversity_lambda,
        )

    @staticmethod
    def _mmr(
        candidates: list[str],
        embeddings: np.ndarray,
        relevance: np.ndarray,
        top_k: int,
        lambda_param: float,
    ) -> list[tuple[str, float]]:
        """Maximal Marginal Relevance: на каждом шаге берём фразу, максимизирующую
        λ·relevance − (1−λ)·max(similarity_with_already_selected).
        Подавляет дубликаты типа "болит сердце" / "сердце болит"."""
        selected: list[int] = []
        remaining = set(range(len(candidates)))

        first = int(np.argmax(relevance))
        selected.append(first)
        remaining.discard(first)

        while remaining and len(selected) < top_k:
            best_score = -np.inf
            best_idx = -1
            selected_embs = embeddings[selected]
            for idx in remaining:
                sim_to_selected = float((embeddings[idx] @ selected_embs.T).max())
                score = lambda_param * relevance[idx] - (1 - lambda_param) * sim_to_selected
                if score > best_score:
                    best_score = score
                    best_idx = idx
            if best_idx < 0:
                break
            selected.append(best_idx)
            remaining.discard(best_idx)

        return [(candidates[i], float(relevance[i])) for i in selected]
