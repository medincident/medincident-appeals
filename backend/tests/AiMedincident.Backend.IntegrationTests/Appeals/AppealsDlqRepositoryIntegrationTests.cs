using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.IntegrationTests.Appeals;

[Collection(nameof(PostgresCollection))]
public sealed class AppealsDlqRepositoryIntegrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    private AppDbContext _db = null!;
    private AppealsDlqRepository _repo = null!;

    public async ValueTask InitializeAsync()
    {
        _db = fixture.CreateDbContext();
        await DatabaseInitialization.EnsureSchemaAsync(_db, attempts: 3, delay: TimeSpan.FromMilliseconds(500));
        await _db.Database.ExecuteSqlRawAsync("TRUNCATE appeals_dlq");
        _repo = new AppealsDlqRepository(_db);
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();

    private static AppealDlqEntry MakeEntry(Guid? id = null, DlqFailureType type = DlqFailureType.NlpFailure, int deliveryCount = 5) =>
        new()
        {
            Id = id ?? Guid.NewGuid(),
            UserId = "user-1",
            Text = "пациент упал с кровати",
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
            FailedAt = DateTimeOffset.UtcNow,
            DeliveryCount = deliveryCount,
            LastError = "nlp-service unreachable",
            FailureType = type,
            PayloadJson = """{"id":"abc","text":"x"}""",
        };

    [Fact]
    public async Task Upsert_inserts_new_entry()
    {
        var entry = MakeEntry();

        await _repo.UpsertAsync(entry, TestContext.Current.CancellationToken);

        var saved = await _db.Set<AppealDlqEntry>().AsNoTracking().SingleAsync(TestContext.Current.CancellationToken);
        saved.Id.Should().Be(entry.Id);
        saved.FailureType.Should().Be(DlqFailureType.NlpFailure);
        saved.DeliveryCount.Should().Be(5);
    }

    [Fact]
    public async Task Upsert_is_idempotent_and_updates_existing()
    {
        var id = Guid.NewGuid();
        await _repo.UpsertAsync(MakeEntry(id, DlqFailureType.NlpFailure, 3), TestContext.Current.CancellationToken);
        await _repo.UpsertAsync(MakeEntry(id, DlqFailureType.ExceededMaxDeliver, 5), TestContext.Current.CancellationToken);

        var rows = await _db.Set<AppealDlqEntry>().AsNoTracking().ToListAsync(TestContext.Current.CancellationToken);
        rows.Should().ContainSingle();
        rows[0].FailureType.Should().Be(DlqFailureType.ExceededMaxDeliver);
        rows[0].DeliveryCount.Should().Be(5);
    }

    [Fact]
    public async Task ListRecent_orders_by_failed_at_desc()
    {
        var older = MakeEntry();
        older.FailedAt = DateTimeOffset.UtcNow.AddHours(-2);

        var newer = MakeEntry();
        newer.FailedAt = DateTimeOffset.UtcNow;

        await _repo.UpsertAsync(older, TestContext.Current.CancellationToken);
        await _repo.UpsertAsync(newer, TestContext.Current.CancellationToken);

        var list = await _repo.ListRecentAsync(10, TestContext.Current.CancellationToken);

        list.Should().HaveCount(2);
        list[0].Id.Should().Be(newer.Id);
        list[1].Id.Should().Be(older.Id);
    }

    [Fact]
    public async Task ListRecent_caps_limit_to_max()
    {
        for (var i = 0; i < 3; i++)
            await _repo.UpsertAsync(MakeEntry(), TestContext.Current.CancellationToken);

        var list = await _repo.ListRecentAsync(limit: 99_999, TestContext.Current.CancellationToken);

        list.Should().HaveCount(3); // нет ошибок при превышении лимита
    }

    [Fact]
    public async Task Count_and_CountByType_return_correct_numbers()
    {
        await _repo.UpsertAsync(MakeEntry(type: DlqFailureType.NlpFailure), TestContext.Current.CancellationToken);
        await _repo.UpsertAsync(MakeEntry(type: DlqFailureType.NlpFailure), TestContext.Current.CancellationToken);
        await _repo.UpsertAsync(MakeEntry(type: DlqFailureType.DbFailure), TestContext.Current.CancellationToken);

        (await _repo.CountAsync(TestContext.Current.CancellationToken)).Should().Be(3);
        (await _repo.CountByTypeAsync(DlqFailureType.NlpFailure, TestContext.Current.CancellationToken)).Should().Be(2);
        (await _repo.CountByTypeAsync(DlqFailureType.DbFailure, TestContext.Current.CancellationToken)).Should().Be(1);
        (await _repo.CountByTypeAsync(DlqFailureType.PublishFailure, TestContext.Current.CancellationToken)).Should().Be(0);
    }
}
