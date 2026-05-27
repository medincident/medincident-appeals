"""Основной цикл генерации.

Реализует фиксы #1, #2, #3, #4, #8, #10, #11, #12, #13, #15.

Ключевые решения:
  * Сэмплирование — per-subcategory (а не per-template), так выравнивается дисбаланс — fix #2.
  * Флаги аугментации — независимые случайные события, а не по модулю — fix #1.
  * Для important на каждую вариацию выбирается случайный парафраз из списка — fix #3.
  * not_important ВСЕГДА имеет formalized=None — fix #4.
  * Таргет достигается циклом with-seen-set, не хрупким for/else/break — fix #13.
  * Split добавляется в каждый пример через splitter.assign_split — fix #12.
  * ~5% ambiguous кейсов — fix #10 (поле в Example, используется для доп. анализа).
  * Метаданные датасета (версия, seed, хеш) пишутся отдельной строкой — fix #15.
"""

from __future__ import annotations

import hashlib
import json
import random
from collections import defaultdict
from dataclasses import dataclass

from .augmenters import apply_distractors, combine_multi, compose_user_text
from .schema import DATASET_VERSION, Example, Template, template_from_tuple
from .splitter import assign_split
from .templates import IMPORTANT_TUPLES, NOT_IMPORTANT_TUPLES


# ── Вероятности аугментаций (fix #1) ─────────────────────────────────────────
@dataclass(frozen=True)
class AugProbs:
    """Вероятности для каждого типа аугментации.
    Подбирались так, чтобы средняя вариация получала 1-2 активные аугментации.
    """

    synonyms: float = 0.40
    colloquial: float = 0.25
    style: float = 0.15
    fixed_typos: float = 0.25
    qwerty_typos: float = 0.15
    multi_complaint: float = 0.08
    distractors: float = 0.30
    distractors_min: int = 2
    distractors_max: int = 8


# ── Конфиг генерации ─────────────────────────────────────────────────────────
@dataclass(frozen=True)
class GenConfig:
    target: int = 3000
    seed: int = 42
    important_ratio: float = 0.75
    max_attempts_factor: int = 8  # сколько раз пробовать генерацию на шаблон
    ambiguous_rate: float = 0.05  # fix #10


# ── Группировка шаблонов по подкатегории (fix #2) ────────────────────────────

def _group_by_subcategory(templates: list[Template]) -> dict[str, list[Template]]:
    """Группируем important-шаблоны по sub_id для равномерного сэмплирования."""
    groups: dict[str, list[Template]] = defaultdict(list)
    for t in templates:
        key = t.sub_id if t.sub_id is not None else "_ni"
        groups[key].append(t)
    return dict(groups)


# ── Построение Example из шаблона ────────────────────────────────────────────

def _build_example(
    tmpl: Template,
    template_id: str,
    rng: random.Random,
    probs: AugProbs,
    ambiguous: bool = False,
    second_tmpl: Template | None = None,
) -> Example:
    """Собирает один Example из шаблона с рандомными аугментациями."""
    # подготавливаем ядро (fix #8: multi-complaint)
    core = tmpl.core
    if second_tmpl is not None:
        core = combine_multi(core, second_tmpl.core, rng)

    if tmpl.is_important() and rng.random() < probs.distractors:
        n = rng.randint(probs.distractors_min, probs.distractors_max)
        core = apply_distractors(core, rng, n_distractors=n)

    # независимые случайные флаги (fix #1)
    use_synonyms = rng.random() < probs.synonyms
    use_colloquial = rng.random() < probs.colloquial
    use_style = rng.random() < probs.style
    use_fixed_typos = rng.random() < probs.fixed_typos
    use_qwerty_typos = rng.random() < probs.qwerty_typos

    noisy, clean = compose_user_text(
        core,
        rng,
        use_synonyms=use_synonyms,
        use_colloquial=use_colloquial,
        use_style=use_style,
        use_fixed_typos=use_fixed_typos,
        use_qwerty_typos=use_qwerty_typos,
    )

    # для important — выбираем случайный парафраз (fix #3)
    if tmpl.is_important():
        assert tmpl.formalized is not None
        idx = rng.randrange(len(tmpl.formalized))
        formalized = tmpl.formalized[idx]
        # multi-complaint: формализованный текст — только первый (так модель учится
        # извлекать доминирующую проблему при смешанных обращениях)
    else:
        # fix #4: для not_important никаких формализаций
        formalized = None

    return Example(
        user_text=noisy,
        template_id=template_id,
        split=assign_split(template_id),
        is_important=tmpl.is_important(),
        reason=tmpl.reason,
        formalized=formalized,
        cat_id=tmpl.cat_id,
        cat_name=tmpl.cat_name,
        sub_id=tmpl.sub_id,
        sub_name=tmpl.sub_name,
        clean_text=clean if clean != noisy else None,
        ambiguous=ambiguous,
    )


# ── Главная функция генерации ────────────────────────────────────────────────

def generate(cfg: GenConfig | None = None) -> tuple[list[Example], dict]:
    """Возвращает (список Example, словарь метаданных)."""
    if cfg is None:
        cfg = GenConfig()

    rng = random.Random(cfg.seed)
    probs = AugProbs()

    # Конвертируем кортежи в Template + валидируем (fix #11 частично — валидация на входе)
    important_templates = [template_from_tuple(t) for t in IMPORTANT_TUPLES]
    not_important_templates = [template_from_tuple(t) for t in NOT_IMPORTANT_TUPLES]

    # Карты id → Template (для multi-complaint и трассировки)
    imp_tid: dict[int, str] = {i: f"imp_{i}" for i in range(len(important_templates))}
    ni_tid: dict[int, str] = {i: f"ni_{i}" for i in range(len(not_important_templates))}

    n_important_target = int(cfg.target * cfg.important_ratio)
    n_not_important_target = cfg.target - n_important_target

    # ── 1. IMPORTANT: генерируем per-subcategory (fix #2) ────────────────────
    imp_by_sub = _group_by_subcategory(important_templates)
    sub_ids = sorted(imp_by_sub.keys())
    n_subs = len(sub_ids)
    per_sub = n_important_target // n_subs
    remainder = n_important_target % n_subs

    imp_examples: list[Example] = []
    seen_texts: set[str] = set()

    for idx, sub_id in enumerate(sub_ids):
        sub_templates = imp_by_sub[sub_id]
        target_for_sub = per_sub + (1 if idx < remainder else 0)

        # fix #13: while-цикл с лимитом попыток, без хрупкого for/else/break
        attempts_budget = target_for_sub * cfg.max_attempts_factor
        collected = 0
        attempts = 0
        while collected < target_for_sub and attempts < attempts_budget:
            attempts += 1
            tmpl = rng.choice(sub_templates)
            # template_id находим обратной карой — проще: ищем позицию шаблона
            orig_idx = important_templates.index(tmpl)
            template_id = imp_tid[orig_idx]

            # fix #8: multi-complaint — только внутри одной подкатегории
            second: Template | None = None
            if len(sub_templates) >= 2 and rng.random() < probs.multi_complaint:
                second = rng.choice([t for t in sub_templates if t is not tmpl])

            # fix #10: иногда помечаем как ambiguous
            ambiguous = rng.random() < cfg.ambiguous_rate

            ex = _build_example(tmpl, template_id, rng, probs, ambiguous=ambiguous, second_tmpl=second)
            if ex.user_text in seen_texts:
                continue
            seen_texts.add(ex.user_text)
            imp_examples.append(ex)
            collected += 1

    # ── 2. NOT_IMPORTANT: равномерно по шаблонам ──────────────────────────────
    ni_examples: list[Example] = []
    per_ni = max(1, n_not_important_target // len(not_important_templates))

    for i, tmpl in enumerate(not_important_templates):
        template_id = ni_tid[i]
        attempts_budget = per_ni * cfg.max_attempts_factor
        collected = 0
        attempts = 0
        while collected < per_ni and attempts < attempts_budget:
            attempts += 1
            ex = _build_example(tmpl, template_id, rng, probs)
            if ex.user_text in seen_texts:
                continue
            seen_texts.add(ex.user_text)
            ni_examples.append(ex)
            collected += 1

    # добиваем до точного количества, сэмплируя случайные not_important шаблоны
    while len(ni_examples) < n_not_important_target:
        i = rng.randrange(len(not_important_templates))
        tmpl = not_important_templates[i]
        template_id = ni_tid[i]
        attempts_budget = 20
        attempts = 0
        while attempts < attempts_budget:
            attempts += 1
            ex = _build_example(tmpl, template_id, rng, probs)
            if ex.user_text not in seen_texts:
                seen_texts.add(ex.user_text)
                ni_examples.append(ex)
                break
        else:
            # не удалось за 20 попыток — выходим чтобы не зациклиться
            break

    # ── 3. Склеиваем, перемешиваем, обрезаем ─────────────────────────────────
    all_examples = imp_examples[:n_important_target] + ni_examples[:n_not_important_target]
    rng.shuffle(all_examples)

    # ── 4. Валидируем каждый пример (fix #11) ────────────────────────────────
    for ex in all_examples:
        json.loads(ex.to_assistant_json())

    # ── 5. Метаданные датасета (fix #15) ─────────────────────────────────────
    templates_hash = _hash_templates(important_templates, not_important_templates)
    meta = {
        "__meta__": True,
        "version": DATASET_VERSION,
        "seed": cfg.seed,
        "target": cfg.target,
        "n_important_templates": len(important_templates),
        "n_not_important_templates": len(not_important_templates),
        "templates_hash": templates_hash,
        "aug_probs": {
            "synonyms": probs.synonyms,
            "colloquial": probs.colloquial,
            "style": probs.style,
            "fixed_typos": probs.fixed_typos,
            "qwerty_typos": probs.qwerty_typos,
            "multi_complaint": probs.multi_complaint,
            "distractors": probs.distractors,
            "distractors_min": probs.distractors_min,
            "distractors_max": probs.distractors_max,
        },
        "ambiguous_rate": cfg.ambiguous_rate,
    }

    return all_examples, meta


def _hash_templates(
    important: list[Template], not_important: list[Template]
) -> str:
    """SHA1 от всех core-строк шаблонов. Меняется при любой правке шаблонов."""
    h = hashlib.sha1()
    for t in important + not_important:
        h.update(t.core.encode("utf-8"))
        h.update(b"|")
    return h.hexdigest()[:16]
