#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compare_approaches.py — единый скрипт сравнения двух подходов обработки
обращений на одном hold-out test set: специализированный NLP-пайплайн
(rubert-base-cased-conversational -> ruT5 -> MiniLM) против одной LLM (Qwen3-4B-GGUF, zero-shot).

ОДИН ФАЙЛ — ДВА ЗАПУСКА (из разных venv):

  1) NLP-прогон (из nlp-service):
       cd nlp-service
       uv run python benchmarks/compare_approaches.py --run nlp [--limit N]
     → пишет nlp-service/benchmarks/results/nlp_results.json

  2) LLM-прогон (из llm-service):
       cd llm-service
       uv run python ../nlp-service/benchmarks/compare_approaches.py --run llm [--limit N]
     → пишет nlp-service/benchmarks/results/llm_results.json

  3) Объединение в одну таблицу (из любого venv, нужны только sklearn+orjson):
       uv run python <путь>/compare_approaches.py --run merge
     → пишет comparison_report.txt + comparison_results.json

Идея: общая часть (датасет, split, метрики) самодостаточна и НЕ импортирует
зависимости nlp-service / llm-service. NLP-блок подключается только при --run nlp,
LLM-блок только при --run llm. Поэтому файл работает из ЛЮБОГО venv без коллизий.

mock_categories.py ищется в порядке: cwd → nlp-service → llm-service.
В обоих сервисах в корне лежит идентичная копия, поэтому запуск из любого
сервиса подхватит категории автоматически.

Test set одинаков для обоих прогонов: split по template_id, seed=42, как в
nlp-service/models/__init__.py (split_by_templates).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections import defaultdict
from pathlib import Path

if __package__ == "benchmarks" or "benchmarks" in sys.modules:
    sys.modules.pop("benchmarks", None)
    __package__ = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("compare")

_HERE = Path(__file__).resolve()
NLP_ROOT = _HERE.parent.parent
PROJECT_ROOT = NLP_ROOT.parent
LLM_ROOT = PROJECT_ROOT / "llm-service"
DATASET_PATH = PROJECT_ROOT / "dataset.jsonl"
RESULTS_DIR = NLP_ROOT / "benchmarks" / "results"


def _find_mock_categories() -> Path:
    """Ищет mock_categories.py в порядке: cwd → nlp-service → llm-service.

    Так файл подхватывается из того сервиса, откуда запускают скрипт.
    """
    candidates = [
        Path.cwd() / "mock_categories.py",
        NLP_ROOT / "mock_categories.py",
        LLM_ROOT / "mock_categories.py",
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(
        "mock_categories.py не найден ни в cwd, ни в nlp-service, ни в llm-service"
    )


CATEGORIES_PY = _find_mock_categories()


def load_test_examples(limit: int | None = None) -> list[dict]:
    """Загружает hold-out test set из dataset.jsonl.

    Логика split — одна-в-один с nlp-service/models/__init__.py:
    split_by_templates(seed=42, val=0.15, test=0.15).
    """
    import orjson

    records: list[dict] = []
    for raw in DATASET_PATH.read_bytes().splitlines():
        if not raw.strip():
            continue
        try:
            rec = orjson.loads(raw)
        except orjson.JSONDecodeError:
            continue
        if "__meta__" in rec:
            continue
        msgs = rec.get("messages") or []
        if len(msgs) < 2:
            continue
        try:
            answer = orjson.loads(msgs[1]["content"])
        except (orjson.JSONDecodeError, KeyError, TypeError):
            continue
        records.append({
            "text": msgs[0]["content"],
            "answer": answer,
            "template_id": rec.get("template_id", f"unknown_{len(records)}"),
        })

    import numpy as np
    tid_to_idx: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(records):
        tid_to_idx[r["template_id"]].append(i)
    unique_tids = list(tid_to_idx)
    np.random.default_rng(42).shuffle(unique_tids)
    n = len(unique_tids)
    n_val = int(n * 0.15)
    n_test = int(n * 0.15)
    test_tids = unique_tids[n_val : n_val + n_test]
    test_idx = [i for tid in test_tids for i in tid_to_idx[tid]]

    test = [records[i] for i in test_idx]
    if limit:
        test = test[:limit]
    logger.info(
        "Test set: %d примеров из %d шаблонов (всего %d записей в датасете)",
        len(test), len(test_tids), len(records),
    )
    return test


def gold_from_test(test: list[dict]) -> list[dict]:
    out = []
    for it in test:
        a = it["answer"]
        out.append({
            "is_important": bool(a.get("is_important")),
            "formalized_text": a.get("formalized_text") or "",
            "category_id": (a.get("category") or {}).get("id") if a.get("category") else None,
            "subcategory_id": (a.get("subcategory") or {}).get("id") if a.get("subcategory") else None,
        })
    return out


def load_categories() -> list[dict]:
    """Читаем mock_categories.py как обычный модуль (без зависимостей)."""
    return _load_module_from_path("mock_categories", CATEGORIES_PY).CATEGORIES


def _load_module_from_path(name: str, path: Path):
    """Грузит Python-файл по полному пути, минуя пакетные __init__.py.

    Нужно, чтобы при импорте LLM-частей из llm-service не выполнялся
    llm-service/service/__init__.py (он тянет nats, prometheus и т.д.)
    и не было коллизий `models` между nlp-service и llm-service.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── метрики ──
def rouge_l(pred: str, ref: str) -> float:
    p = pred.lower().split()
    r = ref.lower().split()
    if not p or not r:
        return 0.0
    dp = [[0] * (len(r) + 1) for _ in range(len(p) + 1)]
    for i in range(1, len(p) + 1):
        for j in range(1, len(r) + 1):
            if p[i - 1] == r[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    lcs = dp[len(p)][len(r)]
    if lcs == 0:
        return 0.0
    prec = lcs / len(p)
    rec = lcs / len(r)
    return 2 * prec * rec / (prec + rec)


def rouge_n(pred: str, ref: str, n: int) -> float:
    from collections import Counter
    def ngrams(tokens: list[str]):
        return [tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]
    p = ngrams(pred.lower().split())
    r = ngrams(ref.lower().split())
    if not p or not r:
        return 0.0
    cp, cr = Counter(p), Counter(r)
    overlap = sum((cp & cr).values())
    if overlap == 0:
        return 0.0
    prec = overlap / len(p)
    rec = overlap / len(r)
    return 2 * prec * rec / (prec + rec)


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * q
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def latency_metrics(latencies: list[float]) -> dict:
    if not latencies:
        return {"avg_ms": None, "p50_ms": None, "p95_ms": None}
    return {
        "avg_ms": round(sum(latencies) / len(latencies) * 1000, 1),
        "p50_ms": round(percentile(latencies, 0.50) * 1000, 1),
        "p95_ms": round(percentile(latencies, 0.95) * 1000, 1),
    }


def _binary_classification_metrics(y_true: list[int], y_pred: list[int]) -> dict:
    """Считаем accuracy, F1-binary (для класса 1) и F1-macro вручную,
    чтобы не тащить sklearn в llm-service.
    """
    n = len(y_true)
    if n == 0:
        return {"accuracy": 0.0, "f1_binary": 0.0, "f1_macro": 0.0}
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    acc = correct / n

    def f1_for(positive: int) -> float:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == positive and p == positive)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != positive and p == positive)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == positive and p != positive)
        if tp == 0:
            return 0.0
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        return 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0

    f1_pos = f1_for(1)
    f1_neg = f1_for(0)
    return {"accuracy": acc, "f1_binary": f1_pos, "f1_macro": (f1_pos + f1_neg) / 2}


def quality_metrics(preds: list[dict], gold: list[dict]) -> dict:
    n = len(gold)
    valid = [p for p in preds if p.get("ok")]
    valid_rate = len(valid) / n if n else 0.0

    y_true = [1 if g["is_important"] else 0 for g in gold]
    y_pred = [1 if p.get("is_important") else 0 for p in preds]

    m = _binary_classification_metrics(y_true, y_pred)
    acc, f1m, f1b = m["accuracy"], m["f1_macro"], m["f1_binary"]

    cat_hit = cat_total = 0
    sub_hit = sub_total = 0
    rouge1 = rouge2 = rougeL = 0.0
    rouge_total = 0

    for p, g in zip(preds, gold):
        if not g["is_important"]:
            continue
        if g.get("category_id"):
            cat_total += 1
            if p.get("category_id") == g["category_id"]:
                cat_hit += 1
        if g.get("subcategory_id"):
            sub_total += 1
            if p.get("subcategory_id") == g["subcategory_id"]:
                sub_hit += 1
        ref = (g.get("formalized_text") or "").strip()
        if ref:
            pred_txt = (p.get("formalized_text") or "").strip()
            rouge1 += rouge_n(pred_txt, ref, 1)
            rouge2 += rouge_n(pred_txt, ref, 2)
            rougeL += rouge_l(pred_txt, ref)
            rouge_total += 1

    return {
        "n": n,
        "valid_output_rate": round(valid_rate, 4),
        "accuracy": round(acc, 4),
        "f1_macro": round(f1m, 4),
        "f1_binary": round(f1b, 4),
        "category_accuracy": round(cat_hit / cat_total, 4) if cat_total else None,
        "subcategory_accuracy": round(sub_hit / sub_total, 4) if sub_total else None,
        "rouge1": round(rouge1 / rouge_total, 4) if rouge_total else None,
        "rouge2": round(rouge2 / rouge_total, 4) if rouge_total else None,
        "rougeL": round(rougeL / rouge_total, 4) if rouge_total else None,
    }


def progress_steps(total: int, steps: int = 10) -> set[int]:
    """Возвращает индексы (1-based), на которых надо логировать прогресс.

    Делит обработку на 10 «десятин»: на 10%, 20%, …, 100% от total.
    Если total < steps — логируем каждый шаг, последний всегда попадает.
    """
    if total <= 0:
        return set()
    if total <= steps:
        return set(range(1, total + 1))
    return {max(1, round(total * k / steps)) for k in range(1, steps + 1)}


def log_progress(tag: str, done: int, total: int, step: int, steps: int = 10) -> None:
    logger.info("  %s %d/%d (%d/%d)", tag, done, total, step, steps)


def process_rss_mb() -> float:
    try:
        import os, resource
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # На Linux ru_maxrss в KB, на macOS — в байтах
        if sys.platform == "darwin":
            return rss / 1024 / 1024
        return rss / 1024
    except Exception:
        try:
            import psutil
            return psutil.Process().memory_info().rss / 1024 / 1024
        except Exception:
            return 0.0


# ─────────────────────────────────────────────────────────────────────────
# Подход 1: NLP-пайплайн (импортируется только при --run nlp)
# ─────────────────────────────────────────────────────────────────────────
def run_nlp(test: list[dict], categories: list[dict], warmup: int, baseline: bool = False) -> dict:
    sys.path.insert(0, str(NLP_ROOT))

    # baseline=True — принудительно загружаем базовые веса HF, игнорируя trained_models/.
    # Модели в models/{classifier,seq2seq}/model.py делают `from paths import TRAINED_*_DIR`,
    # то есть копируют значение в свой namespace при первом импорте. Поэтому
    # подменяем пути в `paths` ДО того, как модули моделей будут загружены.
    if baseline:
        import paths as _paths
        fake = NLP_ROOT / "__no_trained_models__"
        _paths.TRAINED_DIR = fake
        _paths.TRAINED_CLASSIFIER_DIR = fake / "classifier"
        _paths.TRAINED_SEQ2SEQ_DIR = fake / "seq2seq"
        # На случай, если модули моделей уже были импортированы — выкинем их,
        # чтобы при повторном `from models...` они подхватили новые пути.
        for mod_name in list(sys.modules):
            if mod_name.startswith("models."):
                del sys.modules[mod_name]
        logger.warning("BASELINE-режим: trained_models/ игнорируется, используем базовые веса HF.")

    from models.classifier.model import ImportanceClassifier
    from models.seq2seq.model import TextProcessor
    from models.similarity.model import CategoryMatcher

    logger.info("NLP: загрузка моделей...")
    t0 = time.perf_counter()
    clf = ImportanceClassifier(); clf.load()
    s2s = TextProcessor(); s2s.load()
    cm = CategoryMatcher(); cm.load(); cm.update_categories(categories)
    load_time = time.perf_counter() - t0

    if not clf.is_finetuned:
        logger.warning(
            "ВНИМАНИЕ: классификатор НЕ дообучен — метрики будут baseline. "
            "Запусти models/classifier/train.py для дообучения."
        )

    warm_n = min(warmup, len(test))
    if warm_n:
        logger.info("NLP: warmup на %d примерах...", warm_n)
        warm_marks = progress_steps(warm_n)
        step = 0
        for i in range(warm_n):
            clf.predict(test[i]["text"])
            if (i + 1) in warm_marks:
                step += 1
                log_progress("NLP warmup", i + 1, warm_n, step)

    preds: list[dict] = []
    lat_total, lat_clf, lat_form, lat_match = [], [], [], []

    total = len(test)
    marks = progress_steps(total)
    step = 0
    logger.info("NLP: инференс по %d примерам (прогресс с шагом 10%%)...", total)
    for idx, it in enumerate(test):
        t_start = time.perf_counter()
        tc = time.perf_counter()
        is_imp, conf = clf.predict(it["text"])
        lat_clf.append(time.perf_counter() - tc)

        formalized = ""
        cat_id = sub_id = None
        if is_imp:
            tf = time.perf_counter()
            formalized = s2s.formalize(it["text"])
            lat_form.append(time.perf_counter() - tf)
            tm = time.perf_counter()
            cat, sub = cm.match(it["text"], formalized)
            lat_match.append(time.perf_counter() - tm)
            cat_id = cat.get("id") if cat else None
            sub_id = sub.get("id") if sub else None

        lat_total.append(time.perf_counter() - t_start)
        preds.append({
            "ok": True,
            "is_important": is_imp,
            "confidence": float(conf),
            "formalized_text": formalized,
            "category_id": cat_id,
            "subcategory_id": sub_id,
        })
        if (idx + 1) in marks:
            step += 1
            log_progress("NLP", idx + 1, total, step)

    # размер моделей на диске
    cache_dir = NLP_ROOT / "models_cache"
    trained_dir = NLP_ROOT / "trained_models"
    def _dir_size(p: Path) -> int:
        if not p.exists():
            return 0
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    disk = _dir_size(cache_dir) + _dir_size(trained_dir)

    return {
        "predictions": preds,
        "load_time_s": round(load_time, 1),
        "latency_total": latency_metrics(lat_total),
        "latency_classifier": latency_metrics(lat_clf),
        "latency_formalize": latency_metrics(lat_form),
        "latency_match": latency_metrics(lat_match),
        "disk_mb": round(disk / 1024 / 1024, 1),
        "memory_mb": round(process_rss_mb(), 0),
        "is_finetuned": bool(clf.is_finetuned),
    }


# ─────────────────────────────────────────────────────────────────────────
# Подход 2: LLM (импортируется только при --run llm)
# ─────────────────────────────────────────────────────────────────────────
def run_llm(test: list[dict], categories: list[dict], warmup: int, device: str) -> dict:
    """LLM-прогон. Грузим LlamaCppClient напрямую по файловому пути, минуя
    llm-service/service/__init__.py и llm-service/models/__init__.py
    (они тянут лишние зависимости и могут конфликтовать с nlp-service)."""
    import asyncio

    # llm/load.py делает `from paths import MODELS_CACHE_DIR` — нужен llm-service в sys.path
    if str(LLM_ROOT) not in sys.path:
        sys.path.insert(0, str(LLM_ROOT))

    llm_load = _load_module_from_path("_llm_load", LLM_ROOT / "models" / "llm" / "load.py")
    # llm/model.py зависит от llm/load.py через относительный импорт `from .load import ...`.
    # Подсунем уже загруженный модуль под нужным именем, чтобы импорт прошёл.
    sys.modules.setdefault("models", type(sys)("models"))
    sys.modules.setdefault("models.llm", type(sys)("models.llm"))
    sys.modules["models.llm.load"] = llm_load
    llm_model = _load_module_from_path("models.llm.model", LLM_ROOT / "models" / "llm" / "model.py")

    DEFAULT_REPO = llm_load.DEFAULT_REPO
    DEFAULT_QUANT = llm_load.DEFAULT_QUANT
    LlamaCppClient = llm_model.LlamaCppClient

    n_gpu = 999 if device == "cuda" else 0
    logger.info("LLM: загрузка %s (%s), n_gpu_layers=%d...", DEFAULT_REPO, DEFAULT_QUANT, n_gpu)
    t0 = time.perf_counter()
    model_path = llm_load.resolve_model_path(DEFAULT_REPO, DEFAULT_QUANT)
    client = LlamaCppClient(model_path, n_gpu_layers=n_gpu, seed=42)
    load_time = time.perf_counter() - t0

    # Воспроизводим логику service/pipeline.run_analyze прямо здесь,
    # чтобы не подтягивать llm-service/service/__init__.py.
    from pydantic import BaseModel, Field

    SYSTEM_PROMPT = (
        "/no_think\n"
        "Ты классификатор обращений пациентов медицинской организации.\n"
        "Верни строгий JSON по схеме AnalyzeResult.\n"
        "Поля: is_important (bool), formalized_text (str), category (id/name|null), "
        "subcategory (id/name|null). Если is_important=false — category и subcategory = null.\n"
        "Используй только id и name из списка категорий ниже."
    )

    class CategoryRef(BaseModel):
        id: str
        name: str

    class AnalyzeResult(BaseModel):
        is_important: bool
        formalized_text: str = Field(min_length=1)
        category: CategoryRef | None
        subcategory: CategoryRef | None

    def build_user_prompt(text: str, cats: list[dict]) -> str:
        lines = ["Доступные категории инцидентов:"]
        for cat in cats:
            lines.append(f"- [{cat['id']}] {cat['name']}")
            for sub in cat.get("subcategories", []):
                lines.append(f"    * [{sub['id']}] {sub['name']}")
        return f"Обращение пациента:\n{text}\n\n" + "\n".join(lines)

    async def analyze_one(text: str) -> dict:
        prompt = build_user_prompt(text, categories)
        raw = await client.chat_structured(SYSTEM_PROMPT, prompt, AnalyzeResult)
        if not raw.get("is_important"):
            raw["category"] = None
            raw["subcategory"] = None
        return raw

    warm_n = min(warmup, len(test))
    if warm_n:
        logger.info("LLM: warmup на %d примерах...", warm_n)
        warm_marks = progress_steps(warm_n)
        step = 0
        for i in range(warm_n):
            try:
                asyncio.run(analyze_one(test[i]["text"]))
            except Exception:
                pass
            if (i + 1) in warm_marks:
                step += 1
                log_progress("LLM warmup", i + 1, warm_n, step)

    preds: list[dict] = []
    lat: list[float] = []
    total = len(test)
    marks = progress_steps(total)
    step = 0
    logger.info("LLM: инференс по %d примерам (heartbeat на каждом, метки 10%%)...", total)
    for idx, it in enumerate(test):
        logger.info("  LLM → пример %d/%d (старт)", idx + 1, total)
        t_start = time.perf_counter()
        try:
            res = asyncio.run(analyze_one(it["text"]))
            ok = True
        except Exception as e:
            logger.warning("LLM ошибка на примере %d: %s", idx, e)
            res = {}
            ok = False
        dt = time.perf_counter() - t_start
        lat.append(dt)
        logger.info("  LLM ← пример %d/%d готов за %.1fс", idx + 1, total, dt)
        cat = res.get("category") or {}
        sub = res.get("subcategory") or {}
        preds.append({
            "ok": ok,
            "is_important": bool(res.get("is_important")),
            "formalized_text": res.get("formalized_text") or "",
            "category_id": cat.get("id") if cat else None,
            "subcategory_id": sub.get("id") if sub else None,
        })
        if (idx + 1) in marks:
            step += 1
            log_progress("LLM", idx + 1, total, step)

    disk = model_path.stat().st_size if model_path.exists() else 0
    return {
        "predictions": preds,
        "model": f"{DEFAULT_REPO} ({DEFAULT_QUANT})",
        "load_time_s": round(load_time, 1),
        "latency_total": latency_metrics(lat),
        "disk_mb": round(disk / 1024 / 1024, 1),
        "memory_mb": round(process_rss_mb(), 0),
    }


# ─────────────────────────────────────────────────────────────────────────
# Сводный отчёт
# ─────────────────────────────────────────────────────────────────────────
def fmt(v):
    return "—" if v is None else str(v)


def build_report(merged: dict) -> str:
    base = merged.get("nlp_baseline")
    nlp = merged.get("nlp")
    llm = merged.get("llm")
    L = []
    L.append("=" * 88)
    L.append("  СРАВНЕНИЕ ПОДХОДОВ: NLP baseline / NLP дообученный / LLM")
    L.append("=" * 88)
    L.append(f"  Test set: {merged.get('test_size', '—')} примеров (hold-out, split по template_id)")
    L.append("")

    def col(d, key, sub=None):
        if not d:
            return "—"
        x = d.get(key)
        if sub and isinstance(x, dict):
            x = x.get(sub)
        return fmt(x)

    bq = base.get("quality") if base else None
    nq = nlp.get("quality") if nlp else None
    lq = llm.get("quality") if llm else None

    rows = [
        ("КАЧЕСТВО", "", "", ""),
        ("  Accuracy (значимость)", col(bq, "accuracy"), col(nq, "accuracy"), col(lq, "accuracy")),
        ("  F1-macro (значимость)", col(bq, "f1_macro"), col(nq, "f1_macro"), col(lq, "f1_macro")),
        ("  F1-binary (важное)", col(bq, "f1_binary"), col(nq, "f1_binary"), col(lq, "f1_binary")),
        ("  Accuracy категории", col(bq, "category_accuracy"), col(nq, "category_accuracy"), col(lq, "category_accuracy")),
        ("  Accuracy подкатегории", col(bq, "subcategory_accuracy"), col(nq, "subcategory_accuracy"), col(lq, "subcategory_accuracy")),
        ("  ROUGE-1 (формализация)", col(bq, "rouge1"), col(nq, "rouge1"), col(lq, "rouge1")),
        ("  ROUGE-2 (формализация)", col(bq, "rouge2"), col(nq, "rouge2"), col(lq, "rouge2")),
        ("  ROUGE-L (формализация)", col(bq, "rougeL"), col(nq, "rougeL"), col(lq, "rougeL")),
        ("  Valid output rate", col(bq, "valid_output_rate"), col(nq, "valid_output_rate"), col(lq, "valid_output_rate")),
        ("СКОРОСТЬ (мс/обращение)", "", "", ""),
        ("  Latency avg", col(base, "latency_total", "avg_ms"), col(nlp, "latency_total", "avg_ms"), col(llm, "latency_total", "avg_ms")),
        ("  Latency p50", col(base, "latency_total", "p50_ms"), col(nlp, "latency_total", "p50_ms"), col(llm, "latency_total", "p50_ms")),
        ("  Latency p95", col(base, "latency_total", "p95_ms"), col(nlp, "latency_total", "p95_ms"), col(llm, "latency_total", "p95_ms")),
        ("РЕСУРСЫ", "", "", ""),
        ("  Размер моделей (МБ)", col(base, "disk_mb"), col(nlp, "disk_mb"), col(llm, "disk_mb")),
        ("  Память процесса (МБ)", col(base, "memory_mb"), col(nlp, "memory_mb"), col(llm, "memory_mb")),
        ("  Время загрузки (с)", col(base, "load_time_s"), col(nlp, "load_time_s"), col(llm, "load_time_s")),
    ]
    L.append(f"  {'Метрика':<34}{'NLP baseline':>16}{'NLP trained':>16}{'LLM':>16}")
    L.append("  " + "-" * 82)
    for name, a, b, c in rows:
        if a == "" and b == "" and c == "":
            L.append(f"  {name}")
        else:
            L.append(f"  {name:<34}{a:>16}{b:>16}{c:>16}")
    L.append("")
    if nlp:
        L.append("  Разбивка latency NLP дообученного по шагам (avg, мс):")
        L.append(
            f"    классификация: {col(nlp, 'latency_classifier', 'avg_ms')}  "
            f"формализация: {col(nlp, 'latency_formalize', 'avg_ms')}  "
            f"категория: {col(nlp, 'latency_match', 'avg_ms')}"
        )
    L.append("")
    return "\n".join(L)


# ─────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Сравнение NLP vs LLM (одним файлом, два запуска)")
    ap.add_argument("--run", choices=["nlp", "llm", "merge"], required=True,
                    help="что запускать: nlp / llm / merge (объединить уже сохранённые JSON)")
    ap.add_argument("--limit", type=int, default=None, help="ограничить число test-примеров")
    ap.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    ap.add_argument("--warmup", type=int, default=2)
    ap.add_argument("--baseline", action="store_true",
                    help="для --run nlp: игнорировать trained_models/, мерить базовые веса HF")
    args = ap.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    nlp_path = RESULTS_DIR / ("nlp_baseline_results.json" if args.baseline else "nlp_results.json")
    nlp_trained_path = RESULTS_DIR / "nlp_results.json"
    nlp_baseline_path = RESULTS_DIR / "nlp_baseline_results.json"
    llm_path = RESULTS_DIR / "llm_results.json"

    def _save_with_predictions(raw: dict, test: list[dict], path: Path) -> None:
        """Сразу сохраняем predictions + gold + ресурсы на диск,
        ДО подсчёта метрик. Так не теряем многочасовой прогон, если
        квалити-блок упадёт."""
        snapshot = dict(raw)
        snapshot["test_size"] = len(test)
        snapshot["gold"] = gold_from_test(test)
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("Сырые результаты (predictions + gold) сохранены: %s", path)

    def _finalize(raw: dict, test: list[dict], path: Path) -> dict:
        preds = raw.pop("predictions")
        gold = gold_from_test(test)
        raw["quality"] = quality_metrics(preds, gold)
        raw["test_size"] = len(test)
        path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("Финальные результаты сохранены: %s", path)
        return raw

    if args.run == "nlp":
        test = load_test_examples(limit=args.limit)
        categories = load_categories()
        nlp_raw = run_nlp(test, categories, args.warmup, baseline=args.baseline)
        nlp_raw["mode"] = "baseline" if args.baseline else "trained"
        _save_with_predictions(nlp_raw, test, nlp_path)
        nlp_raw = _finalize(nlp_raw, test, nlp_path)
        key = "nlp_baseline" if args.baseline else "nlp"
        print("\n" + build_report({key: nlp_raw, "test_size": len(test)}))

    elif args.run == "llm":
        test = load_test_examples(limit=args.limit)
        categories = load_categories()
        llm_raw = run_llm(test, categories, args.warmup, args.device)
        _save_with_predictions(llm_raw, test, llm_path)
        llm_raw = _finalize(llm_raw, test, llm_path)
        print("\n" + build_report({"llm": llm_raw, "test_size": len(test)}))

    elif args.run == "merge":
        merged: dict = {}
        for key, path in [("nlp_baseline", nlp_baseline_path), ("nlp", nlp_trained_path), ("llm", llm_path)]:
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                # Если в файле есть predictions+gold, но нет quality (упал на метриках) —
                # досчитываем здесь.
                if "predictions" in data and "gold" in data and "quality" not in data:
                    data["quality"] = quality_metrics(data["predictions"], data["gold"])
                    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                    logger.info("  Quality досчитан и сохранён в %s", path)
                merged[key] = data
                merged["test_size"] = data.get("test_size", merged.get("test_size"))
                logger.info("Загружен %s: %s", key.upper(), path)
            else:
                logger.warning("Нет файла %s — пропускаю %s", path, key.upper())

        out_json = RESULTS_DIR / "comparison_results.json"
        out_txt = RESULTS_DIR / "comparison_report.txt"
        out_json.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        report = build_report(merged)
        out_txt.write_text(report, encoding="utf-8")
        print("\n" + report)
        logger.info("Объединено: %s + %s", out_json, out_txt)


if __name__ == "__main__":
    main()
