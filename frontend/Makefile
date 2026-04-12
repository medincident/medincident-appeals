DC := cd .. && docker compose

.PHONY: dev build start lint reinstall \
        up up-dev down logs logs-tail \
        rebuild rebuild-dev clear-cache ps

# ─── Локальная разработка ──────────────────────────────────────────────────

dev:
	bun run dev

build:
	bun run build

start:
	bun run start

lint:
	bun run lint

# Сбросить зависимости и .next, переустановить
reinstall:
	rm -rf .next node_modules
	bun install

# ─── Docker — prod ─────────────────────────────────────────────────────────

up:
	$(DC) --profile prod up frontend --force-recreate --build -d

down:
	$(DC) down frontend

logs:
	$(DC) logs frontend -f

logs-tail:
	$(DC) logs frontend -f --tail 200

# Очистить Next.js кэш и пересобрать
rebuild: clear-cache
	$(DC) --profile prod up frontend --force-recreate --build -d

# ─── Docker — dev ──────────────────────────────────────────────────────────

up-dev:
	$(DC) --profile dev up frontend-dev --force-recreate --build -d

rebuild-dev: clear-cache
	$(DC) --profile dev up frontend-dev --force-recreate --build -d

# ─── Общее ─────────────────────────────────────────────────────────────────

# Статус всех контейнеров
ps:
	$(DC) ps

# Очистить только кэш Next.js (без пересборки)
clear-cache:
	rm -rf .next/cache
