# Связь с medincident-backend: категории и отправка обращений

Дата: 2026-05-28

> **Обновление 2026-05-29:** Этап 1 (категории) реализован НЕ в .NET-backend, а
> вынесен в отдельный Python-микросервис **`categories-service`** (переименован из
> `categories-service-mock`), стек как у AI-сервисов (FastAPI-нет, но uv/httpx/nats-py
> + pyjwt). Логика та же, что описана ниже для .NET `CategoryPublisher`: poll
> medincident-backend под service-токеном (JWT-Bearer, machine key.json) → дерево
> `category→subcategories` с фильтром `isAllowedForPatients` → publish-if-changed в
> NATS KV `medincident/categories`. Переключатель `CATEGORIES_USE_STUB` (true=моки,
> false=реальные). .NET `Features/Categories/` удалён полностью. Разделы ниже про
> «.NET-backend публикует» читать как «categories-service публикует».

## Контекст и проблема

Три кодовые базы:

- **`ai_medincident/backend`** — .NET 9 (`AiMedincident.Backend`), в compose `backend:8080`. Принимает обращения пациентов, гоняет через AI (по NATS), хранит в своей PostgreSQL, отдаёт фронту через SSE.
- **`ai_medincident/{nlp,llm}-service`** — Python AI-сервисы. Анализируют текст, возвращают категорию/подкатегорию. Категории берут из NATS KV (`medincident`/`categories`) или из `static`-файла.
- **`medincident-backend`** — отдельный Go-репозиторий (`MEDINCIDENT_SERVER_URL=http://gateway-server:8080`). Источник истины по категориям/типам и приёмник проанализированных обращений. **Не меняем** — только потребляем HTTP API.

Сейчас категории **моковые**: `categories-service-mock` публикует моки в NATS KV, AI читают оттуда; .NET категорий не трогает. Проанализированные обращения **никуда не уходят** — поток замкнут в .NET (`appeals.submit` → consumer → AI → PostgreSQL → SSE).

Цель:

1. **Этап 1 (категории):** публиковать в NATS реальные категории из `medincident-backend` (вместо моков), фильтруя только patient-видимые. AI продолжают читать из NATS — их трогать не нужно.
2. **Этап 2 (отправка + статус):** после анализа .NET отправляет обращение в `medincident-backend` (`POST /v1/patient-incidents`) под токеном пациента и следит за статусом (HTTP-polling).

## Поток данных (выровнено с пользователем)

```
            ┌─────────────────── medincident-backend (Go, не меняем) ───────────────────┐
            │  GET /v1/organizations/{org}/incident-categories:all                       │
            │  GET /v1/organizations/{org}/incident-types                                │
            │  POST /v1/patient-incidents                                                │
            │  GET /v1/query/patient-incidents/{bufferId}, /v1/query/incidents/{id}      │
            └────────────▲───────────────────────────────────────────▲──────────────────┘
                         │ (service-токен, фоновый poll)              │ (токен пациента, HTTP)
                         │                                            │
   ┌─────────────────────┴──────────────┐                ┌───────────┴───────────────────┐
   │  .NET-backend                       │                │  .NET-backend                  │
   │  CategoryPublisher (BackgroundSvc): │                │  Этап 2: submit + статус       │
   │   poll → дерево+фильтр → NATS KV    │                │  (отдельно, после этапа 1)     │
   └─────────────────────┬───────────────┘                └────────────────────────────────┘
                         │ NATS KV medincident/categories (publish-if-changed)
                         ▼
   ┌──────────────────────────────────────┐
   │  AI-сервисы (nlp, llm) — БЕЗ ИЗМЕНЕНИЙ │  читают категории из NATS (или static),
   │  анализ через NATS, как сейчас         │  возвращают результат в .NET по NATS
   └──────────────────────────────────────┘
```

AI — тупые анализаторы: всё взаимодействие AI↔.NET идёт через NATS, **анализ не трогаем**.

## Ключевые факты о `medincident-backend` (проверено по коду и сгенерированным артефактам)

- **JSON over gateway:** `runtime.NewServeMux` без кастомного маршалера → protojson по умолчанию: поля **camelCase** (`organizationId`, `isActive`, `isAllowedForPatients`, `parentCategoryId`, `nextCursor`), enum'ы — **строки** (`"BUFFER_PRIORITY_HIGH"`), незаданные `optional` — **опускаются**.
- **Auth:** все нужные эндпоинты требуют `Authorization: Bearer <token>`.
- **Модель ≠ мок.** Бэкенд хранит плоское дерево `Category` (`parentCategoryId`) и отдельно `Type` (дети категории). Patient-флаг `isAllowedForPatients` — **на `Type`**, не на категории. Маппинг: backend корневая `Category` → её `Type`-ы как `subcategories` (формат мока).
- **Категории:** `GET /v1/organizations/{orgId}/incident-categories:all` + `GET /v1/organizations/{orgId}/incident-types`. Пагинация (`limit` 1..500 default 50; `nextCursor`→`after`). Не-сотрудник видит только active+patient-allowed; мы дополнительно фильтруем клиентски по `isAllowedForPatients`.
- **Отправка (этап 2):** `POST /v1/patient-incidents`, тело camelCase: `organizationId`(req), `description`(req, исходный текст), `summary`(req, formalized_text), `priority`(req, enum string; `is_important` → HIGH/NORMAL), `categoryId`/`typeId`(opt, UUID; AI subcategory = backend type), `occurredAt`(opt). Ответ `{ "bufferId" }`. Caller → `patientZitadelUserId`.
- **Статус — только polling:** `GET /v1/query/patient-incidents/{bufferId}` → `status` + `publishedIncidentId`; затем `GET /v1/query/incidents/{incidentId}` → `IncidentView.status`.

## Контракт NATS для категорий (существующий, от `categories-service-mock`)

- KV bucket **`medincident`**, ключ **`categories`**, value = JSON-массив UTF-8.
- Форма (её ждёт `CategoryMatcher` в nlp): `[{ "id", "name", "description", "subcategories": [{ "id", "name", "description" }] }]`.
- **Publish-if-changed**: писать в KV только если payload отличается (не плодить revision, не будить watcher'ов зря).

## Решения (согласовано)

1. **Этап 1 — категории в .NET-backend.** Новый `CategoryPublisher : BackgroundService`:
   - Переключатель **`CATEGORIES_USE_STUB`**: `true` → публиковать зашитые моки (поведение как у текущего mock); `false` → тянуть из `medincident-backend`.
   - Реальный режим: периодический **poll каждые N** (конфиг), под **service-токеном Zitadel** (client-credentials из конфига), пагинирует categories+types, собирает дерево `category→subcategories`, фильтрует по `isAllowedForPatients` (пустые категории убираем), **publish-if-changed** в NATS KV `medincident`/`categories`.
   - В prod заменяет `categories-service-mock` (его можно отключить профилем compose).
2. **AI-сервисы — без изменений.** Читают категории из NATS, как сейчас. HTTP/`backend`-источник в AI не нужен (отвергнуто). Существующая source-абстракция nlp (NATS+static) остаётся.
3. **Этап 2 — отправка + статус в .NET** (после этапа 1, отдельно). Архитектуру отправки (токен пациента доступен только в HTTP-запросе, а обработка асинхронная через очередь) решаем при старте этапа 2.

## Архитектура этапа 1 (.NET)

Новый модуль `Features/Categories/`:

- `CategoryNode` (record) — `{ Id, Name, Description, Subcategories: [...] }`, сериализуется в snake-free JSON формата мока (`id/name/description/subcategories`).
- `ICategorySource`:
  - `StubCategorySource` — отдаёт зашитые моки (перенос из `categories-service-mock/mock_categories.py` в C# или чтение из ресурса). Для `CATEGORIES_USE_STUB=true`.
  - `MedincidentCategorySource` — HTTP к `medincident-backend`: пагинирует categories+types, строит дерево, фильтрует `isAllowedForPatients`. Токен — service-токен (см. ниже).
- `ITokenProvider` / `ZitadelServiceTokenProvider` — client-credentials grant к Zitadel (`client_id`/`client_secret`/`scope` из конфига), кэш токена с учётом `expires_in`, refresh при истечении.
- `CategoryPublisher : BackgroundService` — `PeriodicTimer(интервал)`; на тик: `source.GetCategoriesAsync()` → JSON → **publish-if-changed** в NATS KV (через существующий `INatsJSContext`). На старте — немедленный sync; ресилентность к недоступности backend (лог + оставить прошлый KV).
- DI: `CategoriesModule.AddCategories()` — переключение на `CATEGORIES_USE_STUB`, `AddHttpClient("medincident").AddStandardResilienceHandler()`, регистрация publisher как `AddHostedService`.
- Конфиг (`AppOptions`, bind из env `App__...`): `MedincidentServerUrl`, `CategoriesOrgId`, `CategoriesUseStub`, `CategoriesPollSeconds`, и блок Zitadel client-credentials (`CategoriesClientId`, `CategoriesClientSecret`, `CategoriesTokenScope`). Существующие env `MEDINCIDENT_SERVER_URL`/`CATEGORIES_ORG_ID`/`CATEGORIES_USE_STUB` маппятся.

## Обработка ошибок (этап 1)

- Backend недоступен / 5xx / токен невалиден: publisher логирует, **не трогает** существующий KV (AI продолжают на прошлых категориях). Следующий тик повторит.
- Пустой ответ после фильтра: не публиковать (защита от затирания валидных категорий пустым списком) — лог-предупреждение.

## Тестирование (этап 1)

- **.NET unit:** сборка дерева `category→subcategories` из плоских categories+types; фильтр `isAllowedForPatients` (тип false выкидывается, пустая категория выкидывается); пагинация (склейка страниц по `nextCursor`); publish-if-changed (нет публикации при идентичном payload). HTTP — через мок `HttpMessageHandler`/WireMock.
- **.NET unit:** `ZitadelServiceTokenProvider` — кэш и refresh по `expires_in`.
- AI: изменений нет → новых тестов не требуется (читают NATS как раньше).

## Открытые допущения (не блокеры)

1. `medincident-backend` доступен по `MEDINCIDENT_SERVER_URL` из сети .NET.
2. `CATEGORIES_ORG_ID=366537916404531205` — корректная организация.
3. Zitadel выдаёт client-credentials токен с правом читать категории как «не-сотрудник» (→ backend сам отдаёт patient-видимое; клиентский фильтр — подстраховка).
4. NATS KV bucket/key (`medincident`/`categories`) и формат — единый контракт с AI; .NET пишет точно в него.

## Порядок реализации

1. **Этап 1:** `Features/Categories/` (source + token provider + publisher) + конфиг + DI + тесты. В prod отключить `categories-service-mock` профилем. Коммит.
2. **Этап 2:** submit + статус-polling в .NET (после согласования архитектуры отправки). Коммит.
