"""Типы и валидация.

Fix #11 — валидация выходного JSON.
Fix #3  — formalized может быть списком парафраз.
Fix #4  — для not_important formalized=None (не тренируем seq2seq на identity).
Fix #15 — версионирование.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

DATASET_VERSION = "v3"


@dataclass(frozen=True)
class Template:
    """Шаблон жалобы.

    Для important:
        formalized — список парафразов (≥1 элемент).
        Генератор ротирует их при создании вариаций — fix #3.

    Для not_important:
        category/subcategory = None, formalized = None.
    """

    core: str
    formalized: list[str] | None
    cat_id: str | None
    cat_name: str | None
    sub_id: str | None
    sub_name: str | None
    reason: str

    def is_important(self) -> bool:
        return self.cat_id is not None

    def validate(self) -> None:
        if self.is_important():
            if not self.formalized or not any(self.formalized):
                raise ValueError(f"important template must have non-empty formalized: {self.core!r}")
            if not all([self.cat_id, self.cat_name, self.sub_id, self.sub_name]):
                raise ValueError(f"important template must have full cat/sub: {self.core!r}")
        else:
            if any([self.cat_id, self.cat_name, self.sub_id, self.sub_name]):
                raise ValueError(f"not-important must have no category: {self.core!r}")


@dataclass
class Example:
    """Одна сгенерированная пара (user, assistant) с метаданными."""

    user_text: str
    template_id: str
    split: str  # "train" | "val" | "test"
    is_important: bool
    reason: str
    formalized: str | None
    cat_id: str | None
    cat_name: str | None
    sub_id: str | None
    sub_name: str | None
    clean_text: str | None = None  # fix #18 — чистая версия до опечаток для SAGE-like задач
    ambiguous: bool = False  # fix #10 — пограничный случай

    def to_assistant_json(self) -> str:
        """Fix #4: для not_important formalized=null (не identity)."""
        obj = {
            "is_important": self.is_important,
            "reason": self.reason,
            "formalized_text": self.formalized,
            "category": (
                {"id": self.cat_id, "name": self.cat_name} if self.cat_id else None
            ),
            "subcategory": (
                {"id": self.sub_id, "name": self.sub_name} if self.sub_id else None
            ),
        }
        return json.dumps(obj, ensure_ascii=False)

    def to_jsonl_line(self) -> str:
        """Fix #11: валидируем JSON сериализацией assistant-ответа.
        Fix #12: включаем split прямо в запись.
        """
        assistant_content = self.to_assistant_json()
        json.loads(assistant_content)  # raises JSONDecodeError если что-то кривое

        record = {
            "messages": [
                {"role": "user", "content": self.user_text},
                {"role": "assistant", "content": assistant_content},
            ],
            "template_id": self.template_id,
            "split": self.split,
        }
        if self.clean_text is not None and self.clean_text != self.user_text:
            record["clean_text"] = self.clean_text
        if self.ambiguous:
            record["ambiguous"] = True
        return json.dumps(record, ensure_ascii=False)


def template_from_tuple(t: tuple) -> Template:
    """Конвертор из формата (core, formalized, cat_id, cat_name, sub_id, sub_name, reason)
    в Template. formalized может быть строкой/списком."""
    core, formalized, cat_id, cat_name, sub_id, sub_name, reason = t

    if cat_id is None:
        formalized_list: list[str] | None = None
    else:
        if isinstance(formalized, str):
            formalized_list = [formalized]
        else:
            formalized_list = list(formalized)

    tmpl = Template(
        core=core,
        formalized=formalized_list,
        cat_id=cat_id,
        cat_name=cat_name,
        sub_id=sub_id,
        sub_name=sub_name,
        reason=reason,
    )
    tmpl.validate()
    return tmpl
