#!/usr/bin/env python3
"""
classifier_smoke.py — быстрый регресс-набор для ImportanceClassifier.

Фиксированный список «живых» обращений с ожидаемой меткой важности. Это НЕ
hold-out из датасета, а ручной набор граничных случаев, на которых раньше
ломалась классификация:

  • прямые просьбы о помощи / сигналы ухудшения  → должны быть important (раньше FN);
  • мусор / тарабарщина / small talk              → должны быть not_important;
  • короткие просьбы без описания инцидента        → должны быть important.

Цель — за пару секунд увидеть, не вернулась ли исходная проблема, не дожидаясь
полного бенчмарка. Печатает таблицу и завершает работу с кодом 1, если есть
хоть одно расхождение (удобно для CI / pre-commit).

Запуск:
  cd nlp-service
  python3 benchmarks/classifier_smoke.py
"""

import logging
import sys

logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")

# (текст, ожидается_important)
SMOKE_CASES: list[tuple[str, bool]] = [
    # ── прямые просьбы о помощи / сигналы ухудшения (раньше ошибочно not_important) ──
    ("помогите пожалуйста мне очень плохо", True),
    ("помогите пожалуйста", True),
    ("мне плохо", True),
    ("позовите врача срочно", True),
    ("медсестра не приходит на вызов уже час, нужна помощь", True),
    ("у меня сильная боль никто не подходит", True),
    ("не могу дышать, помогите скорее", True),
    ("очень больно, помогите", True),
    # ── короткий голый дистресс (раньше FN: "короткое и голое" → not_important) ──
    ("умираю", True),
    ("помираю", True),
    ("мне плохо", True),
    ("мне очень плохо", True),
    ("привет умираю", True),
    ("здравствуйте мне совсем плохо", True),
    ("теряю сознание", True),
    ("сердце прихватило", True),
    ("кровь не останавливается", True),
    # ── реальные инциденты ──────────────────────────────────────────────────
    ("упал с кровати ночью ударился головой", True),
    ("дали не ту таблетку, перепутали с соседом", True),
    # ── мусор / тарабарщина (должны фильтроваться) ──────────────────────────
    ("ждлорпавыфячс", False),
    ("асдфга йцукен фывфыв", False),
    ("qwerty asdfgh", False),
    ("ыыыыы", False),
    ("Срочно хочу сообщить: ждлорпавыфячс Прошу принять меры.", False),
    # ── длинный повторяющийся спам (раньше FP: длина → важное) ───────────────
    ("привет " * 30, False),
    ("привет " * 10, False),
    ("спасибо " * 25, False),
    ("ок " * 40, False),
    ("хорошо " * 20, False),
    # ── small talk / благодарности / орг-вопросы (не важно) ─────────────────
    ("спасибо доктору всё хорошо", False),
    ("здравствуйте", False),
    ("как мне получить больничный лист при выписке", False),
    ("где находится рентген-кабинет", False),
    ("за окном дождь третий день, скучно лежать", False),
]


def main() -> int:
    from models import ImportanceClassifier

    clf = ImportanceClassifier()
    clf.load()
    status = "fine-tuned" if clf.is_finetuned else "base (НЕ обучена!)"

    print("=" * 78)
    print(f"  CLASSIFIER SMOKE TEST  —  модель: {status}")
    print("=" * 78)

    failures = 0
    for text, expected in SMOKE_CASES:
        is_imp, conf = clf.predict(text)
        ok = is_imp == expected
        if not ok:
            failures += 1
        mark = "  OK" if ok else "FAIL"
        exp_s = "IMPORTANT" if expected else "not_imp"
        got_s = "IMPORTANT" if is_imp else "not_imp"
        snippet = text if len(text) <= 48 else text[:45] + "..."
        print(f"  [{mark}] exp={exp_s:9s} got={got_s:9s} conf={conf:.2f}  {snippet!r}")

    total = len(SMOKE_CASES)
    passed = total - failures
    print("-" * 78)
    print(f"  Passed {passed}/{total}" + ("  ✅" if failures == 0 else f"  ❌ ({failures} FAIL)"))
    print("=" * 78)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
