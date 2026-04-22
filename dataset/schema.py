"""Типы и валидация.

Fix #11 — валидация выходного JSON.
Fix #3  — formalized_text и theses могут быть списком парафраз.
Fix #4  — для not_important formalized=None (не тренируем seq2seq на identity).
Fix #15 — версионирование.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

DATASET_VERSION = "v2"


@dataclass(frozen=True)
class Template:
    """Шаблон жалобы.

    Для important:
        formalized и theses могут быть списками парафраз (≥1 элемент).
        Генератор ротирует их при создании вариаций — fix #3.

    Для not_important:
        category/subcategory = None, formalized/theses = None.
    """

    core: str
    formalized: list[str] | None
    theses: list[list[str]] | None
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
            if not self.theses or not any(self.theses):
                raise ValueError(f"important template must have non-empty theses: {self.core!r}")
            if len(self.formalized) != len(self.theses):
                raise ValueError(
                    f"formalized and theses must have same number of variants: {self.core!r}"
                )
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
    theses: list[str] | None
    cat_id: str | None
    cat_name: str | None
    sub_id: str | None
    sub_name: str | None
    clean_text: str | None = None  # fix #18 — чистая версия до опечаток для SAGE-like задач
    ambiguous: bool = False  # fix #10 — пограничный случай

    def to_assistant_json(self) -> str:
        """Fix #4: для not_important formalized=null и theses=null (не identity)."""
        obj = {
            "is_important": self.is_important,
            "reason": self.reason,
            "formalized_text": self.formalized,
            "theses": self.theses,
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
    """Конвертор из старого формата (core, formalized, theses, cat_id, ...)
    в новый Template. formalized/theses могут быть строкой/списком."""
    core, formalized, theses, cat_id, cat_name, sub_id, sub_name, reason = t

    if cat_id is None:
        formalized_list: list[str] | None = None
        theses_list: list[list[str]] | None = None
    else:
        if isinstance(formalized, str):
            formalized_list = [formalized]
        else:
            formalized_list = list(formalized)

        if theses and isinstance(theses[0], str):
            theses_list = [list(theses)]
        else:
            theses_list = [list(group) for group in theses] if theses else [[]]

        # подгоняем по количеству — если formalized 3, а theses 1 → дублируем theses
        if len(theses_list) == 1 and len(formalized_list) > 1:
            theses_list = theses_list * len(formalized_list)
        elif len(formalized_list) == 1 and len(theses_list) > 1:
            formalized_list = formalized_list * len(theses_list)

    tmpl = Template(
        core=core,
        formalized=formalized_list,
        theses=theses_list,
        cat_id=cat_id,
        cat_name=cat_name,
        sub_id=sub_id,
        sub_name=sub_name,
        reason=reason,
    )
    tmpl.validate()
    return tmpl
