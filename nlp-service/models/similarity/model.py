"""CategoryMatcher на MiniLM-L12-v2 — zero-shot подбор категории через cosine similarity.
Почему она: https://tproger.ru/articles/sravnenie-multiyazychnyh-embeddingov"""

from __future__ import annotations

import logging
from typing import NamedTuple

import numpy as np
from sentence_transformers import SentenceTransformer

from models import get_device
from paths import CACHE_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class CategoryEntry(NamedTuple):
    id: str
    name: str


class SubcategoryEntry(NamedTuple):
    cat_id: str
    sub_id: str
    sub_name: str


def _describe(item: dict) -> str:
    return f"{item['name']}: {item.get('description', item['name'])}"


def _normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 1e-10 else v


class CategoryMatcher:
    def __init__(self) -> None:
        self.model: SentenceTransformer | None = None
        self.device = get_device()
        self._category_by_id: dict[str, CategoryEntry] = {}
        self._categories: list[CategoryEntry] = []
        self._subcategories: list[SubcategoryEntry] = []
        self._category_embeddings: np.ndarray | None = None
        self._subcategory_embeddings: np.ndarray | None = None

    def load(self) -> None:
        logger.info("CategoryMatcher: loading %s on %s", BASE_MODEL, self.device)
        self.model = SentenceTransformer(
            BASE_MODEL,
            cache_folder=str(CACHE_DIR),
            device=self.device,
        )
        logger.info("CategoryMatcher ready on %s", self.device)

    def update_categories(self, categories: list[dict]) -> None:
        assert self.model is not None, "Call load() first"

        self._categories = [CategoryEntry(c["id"], c["name"]) for c in categories]
        self._category_by_id = {c.id: c for c in self._categories}
        self._category_embeddings = self._encode([_describe(c) for c in categories])

        self._subcategories = []
        subcategory_texts: list[str] = []
        for cat in categories:
            for sub in cat.get("subcategories", []):
                self._subcategories.append(SubcategoryEntry(cat["id"], sub["id"], sub["name"]))
                subcategory_texts.append(_describe(sub))

        self._subcategory_embeddings = self._encode(subcategory_texts) if subcategory_texts else None

        logger.info(
            "CategoryMatcher: indexed %d categories, %d subcategories",
            len(self._categories),
            len(self._subcategories),
        )

    def match(
        self,
        text: str,
        formalized: str | None = None,
    ) -> tuple[dict | None, dict | None]:
        if self._category_embeddings is None or not self._categories:
            return None, None

        # Усредняем оригинальный и формальный текст
        texts = [text] if not formalized or formalized == text else [text, formalized]
        query = _normalize(self._encode(texts).mean(axis=0))

        if self._subcategory_embeddings is not None:
            best = int(np.argmax(self._subcategory_embeddings.dot(query)))
            entry = self._subcategories[best]
            parent = self._category_by_id[entry.cat_id]
            return (
                {"id": parent.id, "name": parent.name},
                {"id": entry.sub_id, "name": entry.sub_name},
            )

        best = int(np.argmax(self._category_embeddings.dot(query)))
        cat = self._categories[best]
        return {"id": cat.id, "name": cat.name}, None

    def _encode(self, texts: list[str]) -> np.ndarray:
        return self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
