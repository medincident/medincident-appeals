from __future__ import annotations

from collections.abc import Callable


class CategoryCache:
    """Хранит снимок категорий. Вызывает on_change при каждом обновлении —
    nlp-service использует это, чтобы пересчитать эмбеддинги CategoryMatcher."""

    def __init__(self, on_change: Callable[[list[dict]], None] | None = None) -> None:
        self._data: tuple[dict, ...] = ()
        self._on_change = on_change

    def set(self, value: list[dict]) -> None:
        self._data = tuple(value)
        if self._on_change is not None:
            self._on_change(list(self._data))

    def snapshot(self) -> list[dict]:
        return list(self._data)

    def size(self) -> int:
        return len(self._data)
