from __future__ import annotations


class CategoryCache:
    def __init__(self) -> None:
        self._data: tuple[dict, ...] = ()

    def set(self, value: list[dict]) -> None:
        self._data = tuple(value)

    def snapshot(self) -> list[dict]:
        return list(self._data)

    def size(self) -> int:
        return len(self._data)
