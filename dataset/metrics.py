"""Метрики разнообразия датасета: distinct-n, TTR, средний попарный Jaccard
между вариациями одного шаблона. Без внешних зависимостей (sacrebleu/nltk).
"""

from __future__ import annotations

import itertools
import re

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


def mean_intra_template_jaccard(
    texts_by_template: dict[str, list[str]], max_pairs: int = 10
) -> float:
    """Средний Jaccard между вариациями одного шаблона.
    ~1.0 → вариации почти идентичны (дублирующийся датасет), ~0.5 → хорошее разнообразие.
    На каждый шаблон берём первые max_pairs пар (детерминированно, без O(n²)).
    """
    scores: list[float] = []
    for variants in texts_by_template.values():
        for i, j in itertools.islice(itertools.combinations(range(len(variants)), 2), max_pairs):
            scores.append(_jaccard(tokenize(variants[i]), tokenize(variants[j])))
    return sum(scores) / len(scores) if scores else 0.0


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
