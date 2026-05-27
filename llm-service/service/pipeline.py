from __future__ import annotations

import logging

from pydantic import BaseModel, Field

from models.llm import LlamaCppClient

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "/no_think\n"
    "Ты классификатор обращений пациентов медицинской организации.\n"
    "\n"
    "ШАГ 1. Определи is_important:\n"
    "  true — обращение содержит КОНКРЕТНЫЙ ФАКТ нарушения:\n"
    "    • вред здоровью: упал, ударился, ухудшилось, болит\n"
    "    • нарушение условий: холодно, грязно, плохая еда, шумно\n"
    "    • нарушение питания: голоден, не покормили, не та диета\n"
    "    • ошибка персонала: не то лекарство, нагрубили, игнорируют\n"
    "    • угроза безопасности: инфекция, ошибочная операция\n"
    "\n"
    "  false — во ВСЕХ остальных случаях:\n"
    "    • приветствие, благодарность, прощание («привет», «спасибо»)\n"
    "    • констатация состояния БЕЗ жалобы («я лежу», «иду в туалет», «жду врача»)\n"
    "    • вопрос без жалобы («когда обход?», «где врач?»)\n"
    "    • неясное сообщение БЕЗ конкретного факта нарушения\n"
    "    • любая фраза, по которой нельзя точно сказать, что что-то нарушено\n"
    "\n"
    "ШАГ 2. Заполни поля:\n"
    "  • Если is_important=true — выбери category и subcategory из списка ниже.\n"
    "    Используй ТОЧНО те id и name, что в списке.\n"
    "  • Если is_important=false — category=null И subcategory=null.\n"
    "    НЕ ВЫБИРАЙ категорию, если не уверен, что это жалоба.\n"
    "  • formalized_text — 1-2 предложения нейтральным медицинским языком.\n"
    "\n"
    "ПРИМЕРЫ:\n"
    '\n'
    '«Привет» →\n'
    '{"is_important": false, "formalized_text": "Приветствие пациента.", '
    '"category": null, "subcategory": null}\n'
    '\n'
    '«Я лежу» →\n'
    '{"is_important": false, "formalized_text": "Пациент сообщает о положении лёжа.", '
    '"category": null, "subcategory": null}\n'
    '\n'
    '«Спасибо большое» →\n'
    '{"is_important": false, "formalized_text": "Благодарность пациента.", '
    '"category": null, "subcategory": null}\n'
    '\n'
    '«Я голодный, со вчера не кормили» →\n'
    '{"is_important": true, "formalized_text": "Пациент сообщил о нарушении графика '
    'питания: отсутствие кормления более суток.", '
    '"category": {"id": "cat_6", "name": "Условия пребывания"}, '
    '"subcategory": {"id": "sub_6_2", "name": "Нарушение питания"}}\n'
    '\n'
    '«Упал ночью с кровати, ударился» →\n'
    '{"is_important": true, "formalized_text": "Пациент упал с кровати в ночное время, '
    'получил травму.", '
    '"category": {"id": "cat_1", "name": "Организация ухода за пациентами"}, '
    '"subcategory": {"id": "sub_1_1", "name": "Падения пациентов в МО"}}'
)


class CategoryRef(BaseModel):
    id: str
    name: str


class AnalyzeResult(BaseModel):
    is_important: bool
    formalized_text: str = Field(min_length=1)
    category: CategoryRef | None
    subcategory: CategoryRef | None


def build_user_prompt(text: str, categories: list[dict]) -> str:
    lines = ["Доступные категории инцидентов:"]
    for cat in categories:
        lines.append(f"- [{cat['id']}] {cat['name']}")
        for sub in cat.get("subcategories", []):
            lines.append(f"    * [{sub['id']}] {sub['name']}")
    cats_block = "\n".join(lines)
    return f"Обращение пациента:\n{text}\n\n{cats_block}"


def _enforce_consistency(result: dict) -> dict:
    if not result.get("is_important"):
        result["category"] = None
        result["subcategory"] = None
    return result


async def run_analyze(client: LlamaCppClient, text: str, categories: list[dict]) -> dict:
    user_prompt = build_user_prompt(text, categories)
    raw = await client.chat_structured(SYSTEM_PROMPT, user_prompt, AnalyzeResult)
    return _enforce_consistency(raw)
