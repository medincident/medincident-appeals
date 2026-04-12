"""
CategoryMatcher — подбор категории и подкатегории через косинусное сходство.

Базовая модель: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  - 117 MB, мультиязычная (поддерживает русский)
  - Обучение НЕ НУЖНО — работает zero-shot через embedding similarity
  - Ключевое преимущество: категории приходят из NATS и меняются без переобучения

Алгоритм:
  1. При старте сервиса (или при обновлении категорий из NATS) — кодируем все
     категории/подкатегории один раз → матрица эмбеддингов
  2. При каждом запросе — кодируем formalized_text → вектор
  3. Косинусное сходство → argmax → category + subcategory
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

BASE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
CACHE_DIR = Path(__file__).parent.parent / "models_cache"


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Косинусное сходство между вектором a и матрицей b."""
    a_norm = a / (np.linalg.norm(a) + 1e-10)
    b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-10)
    return b_norm @ a_norm


class CategoryMatcher:
    def __init__(self) -> None:
        self.model: SentenceTransformer | None = None
        # Данные категорий — обновляются из NATS при каждом изменении
        self._categories: list[dict] = []
        self._cat_texts: list[str] = []
        self._cat_embeddings: np.ndarray | None = None
        # Данные подкатегорий — плоский список с привязкой к родителю
        self._sub_meta: list[dict] = []     # {"cat_id", "sub_id", "sub_name"}
        self._sub_texts: list[str] = []
        self._sub_embeddings: np.ndarray | None = None

    def load(self) -> None:
        logger.info("CategoryMatcher: loading %s", BASE_MODEL)
        self.model = SentenceTransformer(BASE_MODEL, cache_folder=str(CACHE_DIR))
        logger.info("CategoryMatcher ready")

    def update_categories(self, categories: list[dict]) -> None:
        """
        Принимает список категорий из NATS (формат categories-service).
        Пересчитывает эмбеддинги — вызывать при старте и при каждом NATS-обновлении.
        """
        assert self.model is not None, "Call load() first"

        self._categories = categories

        # Текст для кодирования категорий: "name: description"
        self._cat_texts = [
            f"{c['name']}: {c.get('description', c['name'])}" for c in categories
        ]
        self._cat_embeddings = self.model.encode(
            self._cat_texts, normalize_embeddings=True, show_progress_bar=False
        )

        # Плоский список подкатегорий
        self._sub_meta = []
        self._sub_texts = []
        for cat in categories:
            for sub in cat.get("subcategories", []):
                self._sub_meta.append({
                    "cat_id": cat["id"],
                    "sub_id": sub["id"],
                    "sub_name": sub["name"],
                })
                self._sub_texts.append(
                    f"{sub['name']}: {sub.get('description', sub['name'])}"
                )

        if self._sub_texts:
            self._sub_embeddings = self.model.encode(
                self._sub_texts, normalize_embeddings=True, show_progress_bar=False
            )

        logger.info(
            "CategoryMatcher: indexed %d categories, %d subcategories",
            len(self._categories),
            len(self._sub_meta),
        )

    def match(self, text: str, formalized: str | None = None) -> tuple[dict | None, dict | None]:
        """
        Возвращает (category, subcategory) в формате {"id": ..., "name": ...}.
        Если передан formalized — усредняем эмбеддинги original+formalized для устойчивости.
        Алгоритм: subcategory-first — описания подкатегорий конкретнее категорий,
        поэтому выбираем лучшую подкатегорию по всем сразу, категория = её родитель.
        Если подкатегорий нет — fallback на category-first.
        Если категории не загружены — возвращает (None, None).
        """
        if self._cat_embeddings is None or not self._categories:
            return None, None

        # Комбинируем original + formalized: усредняем и нормализуем
        texts = [text] if not formalized or formalized == text else [text, formalized]
        embs = self.model.encode(texts, normalize_embeddings=True)
        text_emb = embs.mean(axis=0)
        norm = np.linalg.norm(text_emb)
        if norm > 1e-10:
            text_emb = text_emb / norm

        # --- subcategory-first: выбираем лучшую подкатегорию по всем сразу ---
        if self._sub_embeddings is not None and self._sub_meta:
            sub_scores = _cosine_similarity(text_emb, self._sub_embeddings)
            best_sub_idx = int(np.argmax(sub_scores))
            meta = self._sub_meta[best_sub_idx]
            subcategory = {"id": meta["sub_id"], "name": meta["sub_name"]}

            # Категория = родитель лучшей подкатегории
            parent = next((c for c in self._categories if c["id"] == meta["cat_id"]), None)
            category = {"id": parent["id"], "name": parent["name"]} if parent else None
            return category, subcategory

        # --- fallback: category-first (когда нет подкатегорий) ---
        cat_scores = _cosine_similarity(text_emb, self._cat_embeddings)
        best_cat_idx = int(np.argmax(cat_scores))
        best_cat = self._categories[best_cat_idx]
        return {"id": best_cat["id"], "name": best_cat["name"]}, None
