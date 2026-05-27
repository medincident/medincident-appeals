using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.IntegrationTests.Appeals;

[Collection(nameof(PostgresCollection))]
public sealed class OutboxRepositoryIntegrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    private AppDbContext _db = null!;
    private OutboxRepository _repo = null!;

    public async ValueTask InitializeAsync()
    {
        _db = fixture.CreateDbContext();
        await DatabaseInitialization.EnsureSchemaAsync(_db, attempts: 3, delay: TimeSpan.FromMilliseconds(500));
        await _db.Database.ExecuteSqlRawAsync("TRUNCATE outbox");
        _repo = new OutboxRepository(_db);
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();

    private static OutboxEntry MakeEntry(Guid? aggregateId = null) => new()
    {
        Id = Guid.NewGuid(),
        AggregateId = aggregateId ?? Guid.NewGuid(),
        Subject = "appeals.result.test",
        MsgId = $"result-{Guid.NewGuid()}",
        PayloadJson = """{"hello":"world"}""",
        CreatedAt = DateTimeOffset.UtcNow,
    };

    private async Task SeedAsync(OutboxEntry entry)
    {
        _db.Add(entry);
        await _db.SaveChangesAsync(TestContext.Current.CancellationToken);
        _db.ChangeTracker.Clear();
    }

    [Fact]
    public async Task LockBatch_returns_only_unpublished()
    {
        var unpublished = MakeEntry();
        var published = MakeEntry();
        published.PublishedAt = DateTimeOffset.UtcNow;
        await SeedAsync(unpublished);
        await SeedAsync(published);

        var batch = await _repo.LockBatchForPublishAsync(10, TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);

        batch.Should().ContainSingle();
        batch[0].Id.Should().Be(unpublished.Id);
    }

    [Fact]
    public async Task LockBatch_skips_entries_with_max_attempts()
    {
        var stuck = MakeEntry();
        stuck.Attempts = OutboxRepository.MaxAttempts;
        await SeedAsync(stuck);

        var batch = await _repo.LockBatchForPublishAsync(10, TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);

        batch.Should().BeEmpty();
    }

    [Fact]
    public async Task LockBatch_respects_backoff()
    {
        var recent = MakeEntry();
        recent.Attempts = 2;
        recent.LastAttemptAt = DateTimeOffset.UtcNow.AddSeconds(-1);
        await SeedAsync(recent);

        // attempts=2, backoff=10s, last_attempt=1s ago → not yet
        var notYet = await _repo.LockBatchForPublishAsync(10, TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        notYet.Should().BeEmpty();

        // backoff=0 → должно сразу подобрать
        var picked = await _repo.LockBatchForPublishAsync(10, TimeSpan.Zero, TestContext.Current.CancellationToken);
        picked.Should().ContainSingle().Which.Id.Should().Be(recent.Id);
    }

    [Fact]
    public async Task LockBatch_orders_by_created_at()
    {
        var older = MakeEntry();
        older.CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10);
        var newer = MakeEntry();
        newer.CreatedAt = DateTimeOffset.UtcNow;

        await SeedAsync(newer);
        await SeedAsync(older);

        var batch = await _repo.LockBatchForPublishAsync(10, TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);

        batch.Should().HaveCount(2);
        batch[0].Id.Should().Be(older.Id);
        batch[1].Id.Should().Be(newer.Id);
    }

    [Fact]
    public async Task MarkPublished_sets_timestamp()
    {
        var entry = MakeEntry();
        await SeedAsync(entry);

        await _repo.MarkPublishedAsync(entry.Id, TestContext.Current.CancellationToken);

        var fresh = await _db.Set<OutboxEntry>().AsNoTracking().SingleAsync(e => e.Id == entry.Id, TestContext.Current.CancellationToken);
        fresh.PublishedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task MarkFailed_increments_attempts_and_stores_error()
    {
        var entry = MakeEntry();
        await SeedAsync(entry);

        await _repo.MarkFailedAsync(entry.Id, "boom", TestContext.Current.CancellationToken);
        await _repo.MarkFailedAsync(entry.Id, "boom2", TestContext.Current.CancellationToken);

        var fresh = await _db.Set<OutboxEntry>().AsNoTracking().SingleAsync(e => e.Id == entry.Id, TestContext.Current.CancellationToken);
        fresh.Attempts.Should().Be(2);
        fresh.LastError.Should().Be("boom2");
        fresh.LastAttemptAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Counts_reflect_state()
    {
        var unpublished = MakeEntry();
        var stuck = MakeEntry();
        stuck.Attempts = OutboxRepository.MaxAttempts;
        var published = MakeEntry();
        published.PublishedAt = DateTimeOffset.UtcNow;

        await SeedAsync(unpublished);
        await SeedAsync(stuck);
        await SeedAsync(published);

        (await _repo.CountUnpublishedAsync(TestContext.Current.CancellationToken)).Should().Be(2);
        (await _repo.CountStuckAsync(TestContext.Current.CancellationToken)).Should().Be(1);
    }

    [Fact]
    public async Task DeletePublishedOlderThan_deletes_only_old_published()
    {
        var oldPublished = MakeEntry();
        oldPublished.PublishedAt = DateTimeOffset.UtcNow.AddDays(-30);
        var freshPublished = MakeEntry();
        freshPublished.PublishedAt = DateTimeOffset.UtcNow.AddHours(-1);
        var unpublishedOld = MakeEntry();
        unpublishedOld.CreatedAt = DateTimeOffset.UtcNow.AddDays(-30);

        await SeedAsync(oldPublished);
        await SeedAsync(freshPublished);
        await SeedAsync(unpublishedOld);

        var cutoff = DateTimeOffset.UtcNow.AddDays(-7);
        var deleted = await _repo.DeletePublishedOlderThanAsync(cutoff, TestContext.Current.CancellationToken);

        deleted.Should().Be(1);
        var remaining = await _db.Set<OutboxEntry>().AsNoTracking().ToListAsync(TestContext.Current.CancellationToken);
        remaining.Should().HaveCount(2);
        remaining.Should().NotContain(e => e.Id == oldPublished.Id);
    }
}
