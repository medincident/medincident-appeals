"""Основной цикл генерации датасета.

Ключевые решения:
  * Сэмплирование per-subcategory (не per-template) — выравнивает дисбаланс
    подкатегорий important.
  * Флаги аугментации — независимые случайные события.
  * important: случайный парафраз formalized на каждую вариацию;
    not_important: formalized=None (seq2seq не учится на identity).
  * Целевой объём набирается while-циклом с лимитом попыток и дедупом по тексту.
  * split и метаданные (версия/seed/хеш шаблонов) фиксируются здесь.
"""

from __future__ import annotations

import hashlib
import json
import random
from collections import defaultdict
from dataclasses import dataclass

from .augmenters import apply_distractors, combine_multi, compose_user_text, make_repetition_spam
from .normalize import normalize_formalized
from .schema import DATASET_VERSION, Example, Template, template_from_tuple
from .splitter import assign_split
from .templates import IMPORTANT_TUPLES, NOT_IMPORTANT_TUPLES


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


@dataclass(frozen=True)
class GenConfig:
    target: int = 3000
    seed: int = 42
    important_ratio: float = 0.60
    max_attempts_factor: int = 8  # сколько раз пробовать генерацию на шаблон
    ambiguous_rate: float = 0.05


def _group_by_subcategory(templates: list[Template]) -> dict[str, list[Template]]:
    """Группируем important-шаблоны по sub_id для равномерного сэмплирования."""
    groups: dict[str, list[Template]] = defaultdict(list)
    for t in templates:
        key = t.sub_id if t.sub_id is not None else "_ni"
        groups[key].append(t)
    return dict(groups)


def _build_example(
    tmpl: Template,
    template_id: str,
    rng: random.Random,
    probs: AugProbs,
    ambiguous: bool = False,
    second_tmpl: Template | None = None,
) -> Example:
    """Собирает один Example из шаблона с рандомными аугментациями."""
    core = tmpl.core
    if second_tmpl is not None:
        core = combine_multi(core, second_tmpl.core, rng)

    # снимок ядра до дистракторов/преамбул — короткий чистый вход для seq2seq clean-пар
    bare_core = core

    # not_important: с вероятностью ~12% выдаём ДЛИННЫЙ повторяющийся «спам»
    # ("привет привет привет ...") вместо обычного текста. Без таких примеров
    # длинный бессмысленный повтор дрейфовал в important (утечка длины). Спам
    # бывает разной длины, чтобы разрушить корреляцию длины с классом.
    if not tmpl.is_important() and rng.random() < 0.12:
        spam = make_repetition_spam(rng)
        return Example(
            user_text=spam,
            template_id=template_id,
            split=assign_split(template_id),
            is_important=False,
            reason=tmpl.reason,
            formalized=None,
            cat_id=tmpl.cat_id,
            cat_name=tmpl.cat_name,
            sub_id=tmpl.sub_id,
            sub_name=tmpl.sub_name,
            clean_text=None,
            core_text=None,
            ambiguous=ambiguous,
        )

    # Дистракторы (отвлекающий «шум») добавляем к ОБОИМ классам — раньше только к
    # important, из-за чего модель учила ложный признак «длинный/шумный = важный».
    # Развязка от класса убирает этот лик. Короткие ядра (прямые просьбы о помощи,
    # мусор) не размываем — distractors разрушили бы их смысл и снова связали бы
    # длину с меткой.
    DISTRACTOR_MIN_CORE_LEN = 40
    if len(core) >= DISTRACTOR_MIN_CORE_LEN and rng.random() < probs.distractors:
        n = rng.randint(probs.distractors_min, probs.distractors_max)
        core = apply_distractors(core, rng, n_distractors=n)

    # raw-passthrough: короткое голое ядро без обёрток. Применяем к ОБОИМ классам
    # СИММЕТРИЧНО — иначе «короткое и голое» становится сигналом класса. Раньше
    # голыми оставались только not_important (мусор/реплики), а важные просьбы
    # аугментер всегда оборачивал преамбулами → в датасете было 0 коротких важных
    # против десятков коротких неважных, и модель учила «короткое = неважное»,
    # пропуская "умираю"/"мне плохо". Симметричный проход ломает эту утечку:
    # короткие важные сигналы тоже встречаются голыми.
    RAW_PASSTHROUGH_MAX_LEN = 35
    use_bare = len(core) <= RAW_PASSTHROUGH_MAX_LEN and rng.random() < 0.5

    if use_bare:
        noisy = clean = core
    else:
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

    if tmpl.is_important():
        assert tmpl.formalized is not None
        # случайный парафраз; срезаем канцелярские зачины ("Зафиксировано...",
        # "Отмечается...") — модель должна суммаризовать суть, а не штампы.
        # При multi-complaint таргет берётся от первого шаблона (доминирующая проблема).
        idx = rng.randrange(len(tmpl.formalized))
        formalized = normalize_formalized(tmpl.formalized[idx])
    else:
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
        core_text=bare_core if tmpl.is_important() else None,
        ambiguous=ambiguous,
    )


def generate(cfg: GenConfig | None = None) -> tuple[list[Example], dict]:
    """Возвращает (список Example, словарь метаданных)."""
    if cfg is None:
        cfg = GenConfig()

    rng = random.Random(cfg.seed)
    probs = AugProbs()

    important_templates = [template_from_tuple(t) for t in IMPORTANT_TUPLES]
    not_important_templates = [template_from_tuple(t) for t in NOT_IMPORTANT_TUPLES]

    # template_id по identity шаблона — O(1) и без сверки по значению (важно при
    # совпадающих парафразах у разных шаблонов).
    imp_tid: dict[int, str] = {id(t): f"imp_{i}" for i, t in enumerate(important_templates)}
    ni_tid: dict[int, str] = {i: f"ni_{i}" for i in range(len(not_important_templates))}

    n_important_target = int(cfg.target * cfg.important_ratio)
    n_not_important_target = cfg.target - n_important_target

    # important: поровну по подкатегориям, иначе крупные подкатегории доминируют
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

        attempts_budget = target_for_sub * cfg.max_attempts_factor
        collected = 0
        attempts = 0
        while collected < target_for_sub and attempts < attempts_budget:
            attempts += 1
            tmpl = rng.choice(sub_templates)
            template_id = imp_tid[id(tmpl)]

            # второй шаблон из той же подкатегории — чтобы метки не конфликтовали
            second: Template | None = None
            if len(sub_templates) >= 2 and rng.random() < probs.multi_complaint:
                second = rng.choice([t for t in sub_templates if t is not tmpl])

            ambiguous = rng.random() < cfg.ambiguous_rate

            ex = _build_example(tmpl, template_id, rng, probs, ambiguous=ambiguous, second_tmpl=second)
            if ex.user_text in seen_texts:
                continue
            seen_texts.add(ex.user_text)
            imp_examples.append(ex)
            collected += 1

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

    # цикл выше может недобрать из-за дедупа — добираем случайными шаблонами
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

    all_examples = imp_examples[:n_important_target] + ni_examples[:n_not_important_target]
    rng.shuffle(all_examples)

    for ex in all_examples:
        json.loads(ex.to_assistant_json())  # отсечь повреждённый JSON до записи

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
