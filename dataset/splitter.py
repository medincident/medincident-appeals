"""Детерминированный split train/val/test по template_id.

Fix #12 — split зафиксирован в генераторе (единый для всех тренеров).
Разбиение 70/15/15 делается по хешу template_id, а не по перемешиванию,
поэтому split воспроизводим и стабилен при изменении датасета.
"""

from __future__ import annotations

import hashlib

SPLIT_TRAIN = "train"
SPLIT_VAL = "val"
SPLIT_TEST = "test"


def assign_split(template_id: str, *, salt: str = "v2") -> str:
    """Возвращает split для шаблона.

    70% → train, 15% → val, 15% → test.
    Использует SHA1(template_id + salt) → целое → mod 100.
    Меняй salt если нужен другой split (например, для cross-validation).
    """
    h = hashlib.sha1(f"{template_id}|{salt}".encode("utf-8")).hexdigest()
    bucket = int(h[:8], 16) % 100
    if bucket < 70:
        return SPLIT_TRAIN
    if bucket < 85:
        return SPLIT_VAL
    return SPLIT_TEST
