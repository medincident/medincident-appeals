"""Типы данных датасета (Template, Example) и их валидация."""

from __future__ import annotations

import json
from dataclasses import dataclass

DATASET_VERSION = "v3"


@dataclass(frozen=True)
class Template:
    """Шаблон жалобы.

    Для important: formalized — список парафразов (≥1), генератор выбирает случайный.
    Для not_important: category/subcategory = None, formalized = None.
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
    clean_text: str | None = None  # версия без опечаток — parallel corpus для спелл-коррекции
    core_text: str | None = None  # голое ядро жалобы (до преамбул/дистракторов) — для seq2seq clean-пар
    ambiguous: bool = False  # пограничный случай

    def to_assistant_json(self) -> str:
        """JSON ответа ассистента. Для not_important formalized=null."""
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
        """Одна строка JSONL. split включён в запись; assistant-JSON валидируется."""
        assistant_content = self.to_assistant_json()
        json.loads(assistant_content)  # упадёт на кривом JSON

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
        # core_text пишем только для important и только если он отличается от user_text —
        # seq2seq использует его как короткий чистый вход (noisy+clean обучающие пары).
        if self.core_text is not None and self.core_text != self.user_text:
            record["core_text"] = self.core_text
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
