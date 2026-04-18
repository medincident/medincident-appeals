LLM BENCHMARK PACKAGE
=====================
Бенчмарк Qwen2.5-3B (zero-shot) на test set.
Требует запущенный Ollama с моделью qwen2.5:3b.

СТРУКТУРА
---------
dataset.jsonl              - 3000 примеров
categories.py              - категории инцидентов
benchmark_llm.py           - полный бенчмарк LLM
test_llm.py                - тест на одном примере

УСТАНОВКА OLLAMA
----------------
1. Установить Ollama: https://ollama.com/download
2. Скачать модель:
   ollama pull qwen2.5:3b
   # ~1.9 GB

3. Запустить сервер (если не запущен):
   ollama serve

ИЛИ через Docker:
  docker run -d -p 11434:11434 \
    -v ollama:/root/.ollama \
    --name ollama \
    ollama/ollama

  docker exec ollama ollama pull qwen2.5:3b

ЗАВИСИМОСТИ PYTHON
------------------
pip install rouge-score scikit-learn

ЗАПУСК
------
# Быстрый тест (1 пример, ~2-5 мин CPU)
python3 test_llm.py

# Бенчмарк 30 примеров (~55 мин CPU / ~3 мин GPU)
python3 benchmark_llm.py --limit 30

# Полный бенчмарк (447 примеров, ~14 часов CPU / ~30 мин GPU)
python3 benchmark_llm.py --limit 0

АРГУМЕНТЫ benchmark_llm.py
---------------------------
  --limit 30       количество примеров (0 = все 447)
  --url URL        Ollama URL (default: auto-detect / localhost:11434)
  --model NAME     модель (default: qwen2.5:3b)

РЕЗУЛЬТАТ
---------
Скрипт выведет:
  1. QUALITY METRICS — F1-macro, category/subcategory accuracy, ROUGE
  2. LATENCY — avg, p50, p95, min, max, total
  3. MEMORY — размер модели, потребление Docker контейнера

ПРИМЕЧАНИЕ
----------
categories.py должен лежать в подпапке categories-service/:
  categories-service/categories.py

Если запускаете из другой директории, поправьте путь в начале benchmark_llm.py:
  sys.path.insert(0, str(Path(__file__).parent / "categories-service"))
