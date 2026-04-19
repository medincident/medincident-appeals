"""CategoryMatcher на MiniLM-L12-v2 — zero-shot подбор категории через cosine similarity.
Категории приходят из NATS и меняются без переобучения."""

from __future__ import annotations

import logging

import numpy as np
from sentence_transformers import SentenceTransformer

from models import get_device
from paths import CACHE_DIR

logger = logging.getLogger(__name__)

BASE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a_norm = a / (np.linalg.norm(a) + 1e-10)
    b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-10)
    return b_norm @ a_norm


class CategoryMatcher:
    def __init__(self) -> None:
        self.model: SentenceTransformer | None = None
        self.device = get_device()
        self._categories: list[dict] = []
        self._cat_texts: list[str] = []
        self._cat_embeddings: np.ndarray | None = None
        self._sub_meta: list[dict] = []
        self._sub_texts: list[str] = []
        self._sub_embeddings: np.ndarray | None = None

    def load(self) -> None:
        logger.info("CategoryMatcher: loading %s on %s", BASE_MODEL, self.device)
        self.model = SentenceTransformer(
            BASE_MODEL,
            cache_folder=str(CACHE_DIR),
            device=self.device,
        )
        logger.info("CategoryMatcher ready on %s", self.device)

    def update_categories(self, categories: list[dict]) -> None:
        """Пересчитывает эмбеддинги. Вызывать при старте и при каждом NATS-обновлении."""
        assert self.model is not None, "Call load() first"

        self._categories = categories

        self._cat_texts = [f"{c['name']}: {c.get('description', c['name'])}" for c in categories]
        self._cat_embeddings = self.model.encode(
            self._cat_texts, normalize_embeddings=True, show_progress_bar=False
        )

        self._sub_meta = []
        self._sub_texts = []
        for cat in categories:
            for sub in cat.get("subcategories", []):
                self._sub_meta.append(
                    {
                        "cat_id": cat["id"],
                        "sub_id": sub["id"],
                        "sub_name": sub["name"],
                    }
                )
                self._sub_texts.append(f"{sub['name']}: {sub.get('description', sub['name'])}")

        if self._sub_texts:
            self._sub_embeddings = self.model.encode(
                self._sub_texts, normalize_embeddings=True, show_progress_bar=False
            )

        logger.info(
            "CategoryMatcher: indexed %d categories, %d subcategories",
            len(self._categories),
            len(self._sub_meta),
        )

    def match(
        self,
        text: str,
        formalized: str | None = None,
    ) -> tuple[dict | None, dict | None]:
        """Subcategory-first: описания подкатегорий конкретнее категорий, поэтому сначала
        выбираем лучшую подкатегорию по всем, категория = её родитель. Fallback на
        category-first когда подкатегорий нет."""
        if self._cat_embeddings is None or not self._categories:
            return None, None

        # Усредняем эмбеддинг original+formalized для устойчивости к шуму в original.
        texts = [text] if not formalized or formalized == text else [text, formalized]
        embs = self.model.encode(texts, normalize_embeddings=True)
        text_emb = embs.mean(axis=0)
        norm = np.linalg.norm(text_emb)
        if norm > 1e-10:
            text_emb = text_emb / norm

        if self._sub_embeddings is not None and self._sub_meta:
            sub_scores = _cosine_similarity(text_emb, self._sub_embeddings)
            best_sub_idx = int(np.argmax(sub_scores))
            meta = self._sub_meta[best_sub_idx]
            subcategory = {"id": meta["sub_id"], "name": meta["sub_name"]}

            parent = next((c for c in self._categories if c["id"] == meta["cat_id"]), None)
            category = {"id": parent["id"], "name": parent["name"]} if parent else None
            return category, subcategory

        cat_scores = _cosine_similarity(text_emb, self._cat_embeddings)
        best_cat_idx = int(np.argmax(cat_scores))
        best_cat = self._categories[best_cat_idx]
        return {"id": best_cat["id"], "name": best_cat["name"]}, None
