# backend

Принимает обращения пациентов из фронтенда, прогоняет их через `nlp-service` и складывает в базу данных.

Стек: .NET 10, минимальные API, Serilog, EF Core (Npgsql), NATS.Client (Core + JetStream), Zitadel для авторизации.

## NATS

| Subject | Тип | Кто |
|---------|-----|-----|
| `appeals.submit` | JetStream pull (`APPEALS` stream, durable `appeals-backend`) | потребляет backend |
| `nlp.analyze` | core request/reply, queue group `nlp-workers` | публикует backend, отвечает nlp-service |
| `appeals.result.{id}` | JetStream + core publish | публикует backend, читает frontend |

## HTTP

Под `/api/v1`, JWT от Zitadel:

- `GET  /users/{userId}/appeals?search=&category=&subcategory=` — список
- `DELETE /users/{userId}/appeals/{id}` — удалить
- `GET /health` — healthcheck (проверяет Postgres + NATS + JetStream consumer)

## Запуск

Из корня:

```bash
docker compose --profile dev up -d --build
```

Локально без Docker (нужны Postgres и NATS снаружи):

```bash
cd src/AiMedincident.Backend
dotnet run
```

## Конфиг

Через секцию `App` в `appsettings.json` или env-переменные `App__*`:

| Ключ | Default | Что |
|------|---------|-----|
| `NatsUrl` | `nats://nats:4222` | NATS |
| `HttpAddr` | `:8080` | bind |
| `ZitadelIssuer` | — | issuer для JWT |
| `AppealLastsDays` | 365 | retention |
| `AppealsResubmitIntervalMinutes` | 5 | период sweep'а |
| `AppealsResubmitStaleMinutes` | 2 | возраст для повторной отправки |

`ConnectionStrings__AppDb` — строка подключения к Postgres.

## Миграции

EF Core, через `IDesignTimeDbContextFactory` в [AppDbContext.cs](src/AiMedincident.Backend/Shared/Persistence/AppDbContext.cs):

```bash
cd src/AiMedincident.Backend
dotnet ef migrations add <Name> --output-dir Shared/Persistence/Migrations
```

## Тесты

```bash
dotnet test 
dotnet test tests/AiMedincident.Backend.UnitTests
dotnet test tests/AiMedincident.Backend.IntegrationTests
```

## Структура

```
src/AiMedincident.Backend/
├── Program.cs
├── Features/
│   ├── Appeals/        # consumer, processor, resubmit, repository
│   ├── Nlp/            # NATS-клиент к nlp-service
│   ├── Auth/           # Zitadel JWT + ZitadelUserAuthFilter
│   ├── Audit/          # audit_log
│   ├── Health/         # healthcheck'и
│   └── Retention/      # фоновое удаление по retention
└── Shared/
    ├── Configuration/  # AppOptions
    ├── Logging/        # Serilog
    ├── Nats/           # AddNats + INatsJSContext
    └── Persistence/    # AppDbContext, миграции, DI
```
