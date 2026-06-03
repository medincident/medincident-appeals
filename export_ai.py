#!/usr/bin/env python3
"""Экспортирует код обоих AI-сервисов (nlp-service + llm-service) + генератор
датасета в один zip — БЕЗ весов моделей и натренированных весов.

Цель — распаковать архив на другой машине (например, Windows с GPU) и сразу
запустить обучение, без доступа к этому репозиторию.

Что попадает в архив (под единым корнем, по умолчанию `ai_medincident/`):

    nlp-service/            — код пайплайна (rubert + ruT5 + MiniLM)
    llm-service/            — код LLM-сервиса (qwen3 GGUF)
    dataset/                — пакет-генератор (шаблоны, аугментеры, splitter)
    dataset.jsonl           — готовый датасет (3000 примеров)
    dataset.meta.json       — метаданные (seed, баланс, хеш шаблонов)
    generate_dataset.py     — регенерация датасета
    *.bat                   — Windows-хелперы: setup / download / train / verify
    START_HERE_WINDOWS.md   — пошаговая инструкция

ИСКЛЮЧАЕТСЯ: базовые веса (`models_cache/`), натренированные веса
(`trained_models/`), окружения (`.venv/`), кэши, `.env` (секреты), `*.zip/*.bak`.

Относительная структура сохранена: сервисы ожидают `../dataset.jsonl`, поэтому
всё лежит под одним корнем и пути работают сразу после распаковки.

Использование:
    python3 export_ai.py                       # → ai_medincident_export.zip
    python3 export_ai.py --output build.zip
    python3 export_ai.py --only nlp-service    # экспортировать один сервис
    python3 export_ai.py --root-prefix work    # другая корневая папка в архиве
"""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

ROOT_DIR: Path = Path(__file__).resolve().parent

# Сервисы, которые экспортируем. Каждый кладётся под <root_prefix>/<имя>.
ALL_SERVICES = ["nlp-service", "llm-service"]

# Каталоги, которые НИКОГДА не попадают в архив (веса, кэши, окружения).
EXCLUDE_DIRS = {
    "models_cache",       # базовые веса моделей (скачиваются на месте)
    "trained_models",     # натренированные веса (создаются обучением)
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    ".git",
    "node_modules",
}
EXCLUDE_SUFFIXES = {".pyc", ".pyo", ".zip", ".bak"}
# веса моделей по расширению — на случай, если лежат вне models_cache/trained_models.
EXCLUDE_WEIGHT_SUFFIXES = {".safetensors", ".bin", ".gguf", ".pt", ".pth", ".ckpt", ".onnx", ".h5"}
# .env не экспортируем (секреты!), .env.example — оставляем.
EXCLUDE_FILES = {".models_loaded", ".DS_Store", "Thumbs.db"}


def should_exclude(rel: Path) -> bool:
    for part in rel.parts:
        if part in EXCLUDE_DIRS:
            return True
    name = rel.name
    if rel.suffix in EXCLUDE_SUFFIXES:
        return True
    if rel.suffix in EXCLUDE_WEIGHT_SUFFIXES:
        return True
    if name in EXCLUDE_FILES:
        return True
    # .env, .env.local и т.п. — да; .env.example — нет.
    if name.startswith(".env") and name != ".env.example":
        return True
    return False


def iter_tree(root: Path, arc_prefix: str) -> list[tuple[Path, str]]:
    """(абсолютный путь, имя в архиве) для каждого файла под root."""
    pairs: list[tuple[Path, str]] = []
    for file in sorted(root.rglob("*")):
        if not file.is_file():
            continue
        rel = file.relative_to(root)
        if should_exclude(rel):
            continue
        pairs.append((file, f"{arc_prefix}/{rel.as_posix()}"))
    return pairs


# ── Windows-хелперы, встраиваемые в архив ────────────────────────────────────
# Пишутся с CRLF (см. _to_archive_text), чтобы корректно работать в cmd.exe.

SETUP_NLP_BAT = r"""@echo off
REM Установка зависимостей nlp-service через uv (поставит CUDA-torch на Windows).
cd /d "%~dp0nlp-service"
where uv >nul 2>nul
if errorlevel 1 (
  echo [!] uv не найден. Установка uv...
  powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
  echo [!] Перезапустите этот файл в НОВОМ окне терминала (uv добавлен в PATH).
  pause
  exit /b 1
)
echo [*] uv sync (это поставит torch с поддержкой CUDA на Windows)...
uv sync
if errorlevel 1 ( echo [X] uv sync завершился с ошибкой & pause & exit /b 1 )
echo [OK] Зависимости nlp-service установлены.
pause
"""

DOWNLOAD_MODELS_NLP_BAT = r"""@echo off
REM Скачивание базовых весов nlp-service (~1 ГБ: rubert-base + ruT5 + MiniLM).
cd /d "%~dp0nlp-service"
echo [*] Скачивание базовых моделей...
uv run python scripts/load_models.py
if errorlevel 1 ( echo [X] Не удалось скачать модели & pause & exit /b 1 )
echo [OK] Базовые модели в nlp-service\models_cache\.
pause
"""

TRAIN_NLP_BAT = r"""@echo off
REM Полное обучение nlp-service: классификатор важности + seq2seq формализация.
cd /d "%~dp0nlp-service"
echo ============================================================
echo  1/2  Обучение классификатора важности (rubert-base)
echo       CPU: ~20-40 мин  ^|  GPU: ~3-5 мин
echo ============================================================
uv run python -m models.classifier.train
if errorlevel 1 ( echo [X] Обучение классификатора прервано & pause & exit /b 1 )
echo.
echo ============================================================
echo  2/2  Обучение seq2seq формализации (ruT5)
echo       CPU: ~2 ч  ^|  GPU: ~15 мин
echo ============================================================
uv run python -m models.seq2seq.train
if errorlevel 1 ( echo [X] Обучение seq2seq прервано & pause & exit /b 1 )
echo.
echo [OK] Обучение завершено. Веса в nlp-service\trained_models\.
pause
"""

TRAIN_CLASSIFIER_ONLY_BAT = r"""@echo off
REM Только классификатор важности (быстро, для итераций).
cd /d "%~dp0nlp-service"
uv run python -m models.classifier.train
if errorlevel 1 ( echo [X] Обучение прервано & pause & exit /b 1 )
echo [OK] Классификатор обучен. Веса в nlp-service\trained_models\classifier\.
pause
"""

VERIFY_NLP_BAT = r"""@echo off
REM Проверка качества после обучения: smoke-тест + полный бенчмарк классификатора.
cd /d "%~dp0nlp-service"
echo ============================================================
echo  SMOKE-ТЕСТ (живые примеры, должно быть 20/20)
echo ============================================================
uv run python benchmarks/classifier_smoke.py
echo.
echo ============================================================
echo  БЕНЧМАРК КЛАССИФИКАТОРА (F1-macro + confusion на hold-out)
echo ============================================================
uv run python benchmarks/classifier_bench.py
pause
"""

REGEN_DATASET_BAT = r"""@echo off
REM Перегенерация датасета (если меняли шаблоны в dataset\templates\).
cd /d "%~dp0"
cd nlp-service
uv run python -m dataset --target 3000 --output ..\dataset.jsonl --meta-output ..\dataset.meta.json
if errorlevel 1 ( echo [X] Генерация прервана & pause & exit /b 1 )
echo [OK] dataset.jsonl перегенерирован.
pause
"""

SETUP_LLM_BAT = r"""@echo off
REM Установка зависимостей llm-service (llama-cpp-python). Сервис НЕ обучается —
REM это инференс готовой GGUF-модели (резервный путь / baseline для сравнения).
cd /d "%~dp0llm-service"
where uv >nul 2>nul
if errorlevel 1 (
  echo [!] uv не найден. Установка uv...
  powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
  echo [!] Перезапустите этот файл в НОВОМ окне терминала.
  pause
  exit /b 1
)
echo [*] uv sync...
uv sync
if errorlevel 1 ( echo [X] uv sync завершился с ошибкой & pause & exit /b 1 )
echo [*] Скачивание GGUF-модели (~2.5 ГБ)...
uv run python -m models.llm.load
echo [OK] llm-service готов. Запуск: cd llm-service ^&^& uv run uvicorn main:app --port 8001
pause
"""

START_HERE_MD = r"""# Запуск на Windows

Архив содержит только КОД двух сервисов, генератор и готовый датасет.
Веса моделей (базовые и натренированные) в архив НЕ входят — базовые скачивают
хелперы (шаг 2), натренированные создаются обучением (шаг 3).

## Требования

- **Python 3.12+** — https://www.python.org/downloads/ (при установке отметьте *Add to PATH*).
- **uv** (менеджер пакетов) — хелперы поставят сами, либо вручную:
  PowerShell → `irm https://astral.sh/uv/install.ps1 | iex`
- Для GPU-обучения: видеокарта NVIDIA + свежий драйвер.
  `uv sync` сам поставит сборку torch с CUDA (настроено в `nlp-service/pyproject.toml`).
  Без NVIDIA обучение пойдёт на CPU — медленнее, но рабочее.

## Обучение nlp-service (основной путь — то, что обучается)

Запускайте `.bat` по порядку (двойной клик или из терминала):

| Шаг | Файл | Что делает | Время |
|-----|------|------------|-------|
| 1 | `setup_nlp.bat` | `uv sync` — установка зависимостей (+ CUDA-torch) | 3-10 мин |
| 2 | `download_models_nlp.bat` | скачать базовые веса (~1 ГБ) | 2-10 мин |
| 3 | `train_nlp.bat` | обучить классификатор + seq2seq | CPU ~2.5 ч / GPU ~20 мин |
| 4 | `verify_nlp.bat` | smoke-тест (20/20) + бенчмарк F1-macro | 1-2 мин |

Только классификатор (быстрая итерация) — `train_classifier_only.bat`.
Перегенерировать датасет после правок шаблонов — `regen_dataset.bat`.

После обучения веса лежат в `nlp-service\trained_models\` — сервис при старте
подхватит их автоматически.

## Запуск сервиса локально

```
cd nlp-service
uv run uvicorn main:app --port 8000
```
Проверка: открыть http://localhost:8000/health

## llm-service (необязательно — не обучается)

`setup_llm.bat` — установит зависимости и скачает GGUF-модель (~2.5 ГБ).
Это резервный путь анализа и baseline для сравнения, обучение ему не нужно.

## Параметры обучения (по желанию)

```
cd nlp-service
uv run python -m models.classifier.train --epochs 4 --batch 16 --lr 2e-5
uv run python -m models.seq2seq.train   --epochs 10 --batch 32 --lr 5e-5
```
Полный список флагов: добавьте `--help` к любой команде.
"""

# (имя файла в архиве, содержимое, перевод-в-CRLF)
HELPER_FILES: list[tuple[str, str, bool]] = [
    ("setup_nlp.bat", SETUP_NLP_BAT, True),
    ("download_models_nlp.bat", DOWNLOAD_MODELS_NLP_BAT, True),
    ("train_nlp.bat", TRAIN_NLP_BAT, True),
    ("train_classifier_only.bat", TRAIN_CLASSIFIER_ONLY_BAT, True),
    ("verify_nlp.bat", VERIFY_NLP_BAT, True),
    ("regen_dataset.bat", REGEN_DATASET_BAT, True),
    ("setup_llm.bat", SETUP_LLM_BAT, True),
    ("START_HERE_WINDOWS.md", START_HERE_MD, False),
]


def _to_archive_text(content: str, crlf: bool) -> str:
    if crlf:
        return content.replace("\r\n", "\n").replace("\n", "\r\n")
    return content


def build(output: Path, services: list[str], root_prefix: str) -> None:
    pairs: list[tuple[Path, str]] = []

    # 1. Код сервисов
    for svc in services:
        svc_dir = ROOT_DIR / svc
        if not svc_dir.is_dir():
            print(f"  ! пропуск сервиса: {svc_dir} не найден")
            continue
        pairs.extend(iter_tree(svc_dir, f"{root_prefix}/{svc}"))

    # 2. Генератор датасета (нужен и для регенерации, и как зависимость train.py)
    dataset_dir = ROOT_DIR / "dataset"
    if dataset_dir.is_dir():
        pairs.extend(iter_tree(dataset_dir, f"{root_prefix}/dataset"))
    else:
        print(f"  ! пропуск: {dataset_dir} не найдена")

    # 3. Отдельные файлы в корень архива
    for name in ("dataset.jsonl", "dataset.meta.json", "generate_dataset.py"):
        src = ROOT_DIR / name
        if src.is_file():
            pairs.append((src, f"{root_prefix}/{name}"))
        else:
            print(f"  ! пропуск: {src} не найден")

    # Защита от дублей имён в архиве
    seen: set[str] = set()
    file_pairs: list[tuple[Path, str]] = []
    for src, arc in pairs:
        if arc in seen:
            continue
        seen.add(arc)
        file_pairs.append((src, arc))

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for src, arc in sorted(file_pairs, key=lambda p: p[1]):
            zf.write(src, arc)
        # 4. Сгенерированные хелперы (только если экспортируем nlp-service)
        if "nlp-service" in services:
            for name, content, crlf in HELPER_FILES:
                zf.writestr(f"{root_prefix}/{name}", _to_archive_text(content, crlf))

    n_files = len(file_pairs) + ("nlp-service" in services) * len(HELPER_FILES)
    size_mb = output.stat().st_size / 1024 / 1024
    print(f"  сервисы:   {', '.join(services)}")
    print(f"  корень:    {root_prefix}/")
    print(f"  файлов:    {n_files}")
    if "nlp-service" in services:
        print(f"  хелперы:   {', '.join(n for n, _, _ in HELPER_FILES)}")
    print(f"\nГотово: {output}  ({size_mb:.1f} MB)")
    print("Распакуйте на Windows и откройте START_HERE_WINDOWS.md")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Экспорт кода nlp-service + llm-service + датасета в zip (без весов моделей)."
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT_DIR / "ai_medincident_export.zip",
        help="Путь к выходному zip (по умолчанию ai_medincident_export.zip).",
    )
    parser.add_argument(
        "--only", choices=ALL_SERVICES, action="append", dest="services",
        help="Экспортировать только указанный сервис (можно повторять). По умолчанию — оба.",
    )
    parser.add_argument(
        "--root-prefix", default="ai_medincident",
        help="Имя корневой папки внутри архива.",
    )
    args = parser.parse_args()

    services = args.services or list(ALL_SERVICES)

    print(f"Экспорт → {args.output}")
    print("Исключаем веса: models_cache/, trained_models/, *.safetensors/*.gguf/*.bin/...")
    print(f"Также: {', '.join(sorted(EXCLUDE_DIRS - {'models_cache', 'trained_models'}))} + .env(кроме .example) + *.zip/*.bak\n")
    build(args.output, services, args.root_prefix)


if __name__ == "__main__":
    main()
