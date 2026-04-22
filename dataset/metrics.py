"""Метрики разнообразия датасета.

Fix #14 — distinct-n, TTR, средний попарный Jaccard между вариациями шаблона.
Без внешних зависимостей (sacrebleu/nltk); self-BLEU приближаем через Jaccard —
для контроля «насколько не дублирующийся» дешёвой метрикой это достаточно.
"""

from __future__ import annotations

import re
from collections import Counter


_TOKEN_RE = re.compile(r"[а-яёa-z0-9]+", re.IGNORECASE)


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def distinct_n(texts: list[str], n: int) -> float:
    """Доля уникальных n-грамм среди всех.
    Чем выше — тем разнообразнее датасет.
    """
    total = 0
    uniq: set[tuple[str, ...]] = set()
    for text in texts:
        tokens = tokenize(text)
        for i in range(len(tokens) - n + 1):
            ngram = tuple(tokens[i : i + n])
            uniq.add(ngram)
            total += 1
    if total == 0:
        return 0.0
    return len(uniq) / total


def ttr(texts: list[str]) -> float:
    """Type-token ratio: уникальные слова / все слова.
    Чем выше — тем богаче лексика (плато при больших корпусах — это норма)."""
    all_tokens: list[str] = []
    for text in texts:
        all_tokens.extend(tokenize(text))
    if not all_tokens:
        return 0.0
    return len(set(all_tokens)) / len(all_tokens)


def _jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    return len(sa & sb) / max(1, len(sa | sb))


def mean_intra_template_jaccard(texts_by_template: dict[str, list[str]]) -> float:
    """Средний Jaccard между вариациями одного шаблона.
    Близко к 1.0 → вариации почти идентичны (плохо, датасет дублирующийся).
    Близко к 0.5 → хорошее разнообразие.
    """
    scores: list[float] = []
    for variants in texts_by_template.values():
        if len(variants) < 2:
            continue
        # сэмплируем максимум 10 пар на шаблон — чтобы не O(n²)
        pairs = min(10, len(variants) * (len(variants) - 1) // 2)
        seen: set[tuple[int, int]] = set()
        for _ in range(pairs):
            i, j = 0, 1
            # простой детерминированный проход — не нужна случайность
            if pairs >= 10:
                for ii in range(len(variants)):
                    for jj in range(ii + 1, len(variants)):
                        if (ii, jj) in seen:
                            continue
                        seen.add((ii, jj))
                        i, j = ii, jj
                        break
                    else:
                        continue
                    break
            scores.append(_jaccard(tokenize(variants[i]), tokenize(variants[j])))
    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def summarize(texts: list[str], texts_by_template: dict[str, list[str]]) -> dict[str, float]:
    """Сводка метрик — то, что печатается в конце генерации."""
    if not texts:
        return {"distinct_1": 0.0, "distinct_2": 0.0, "distinct_3": 0.0, "ttr": 0.0, "intra_jaccard": 0.0}
    return {
        "distinct_1": distinct_n(texts, 1),
        "distinct_2": distinct_n(texts, 2),
        "distinct_3": distinct_n(texts, 3),
        "ttr": ttr(texts),
        "intra_jaccard": mean_intra_template_jaccard(texts_by_template),
    }


def length_stats(texts: list[str]) -> dict[str, float]:
    lengths = [len(t) for t in texts]
    return {
        "min": float(min(lengths)),
        "max": float(max(lengths)),
        "avg": sum(lengths) / len(lengths),
    }


def token_count_stats(texts: list[str]) -> dict[str, float]:
    counts = [len(tokenize(t)) for t in texts]
    return {
        "min": float(min(counts)),
        "max": float(max(counts)),
        "avg": sum(counts) / len(counts),
    }
