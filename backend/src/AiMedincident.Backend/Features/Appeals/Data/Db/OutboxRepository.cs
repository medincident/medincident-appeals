using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

public sealed class OutboxRepository(AppDbContext db)
{
    public const int MaxAttempts = 10;

    public async Task<IReadOnlyList<OutboxEntry>> LockBatchForPublishAsync(
        int limit,
        TimeSpan retryBackoff,
        CancellationToken ct)
    {
        var backoffSeconds = retryBackoff.TotalSeconds;

        return await db.Set<OutboxEntry>()
            .FromSql($"""
                SELECT id, aggregate_id, subject, msg_id, payload_json,
                       created_at, published_at, attempts, last_error, last_attempt_at
                FROM outbox
                WHERE published_at IS NULL
                  AND attempts < {MaxAttempts}
                  AND (last_attempt_at IS NULL
                       OR last_attempt_at < NOW() - make_interval(secs => attempts * {backoffSeconds}))
                ORDER BY created_at
                LIMIT {limit}
                FOR UPDATE SKIP LOCKED
                """)
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public Task<int> MarkPublishedAsync(Guid id, CancellationToken ct) =>
        db.Set<OutboxEntry>()
            .Where(e => e.Id == id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(e => e.PublishedAt, DateTimeOffset.UtcNow),
                ct);

    public Task<int> MarkFailedAsync(Guid id, string error, CancellationToken ct) =>
        db.Set<OutboxEntry>()
            .Where(e => e.Id == id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(e => e.Attempts, e => e.Attempts + 1)
                .SetProperty(e => e.LastError, error)
                .SetProperty(e => e.LastAttemptAt, DateTimeOffset.UtcNow),
                ct);

    public Task<int> CountUnpublishedAsync(CancellationToken ct) =>
        db.Set<OutboxEntry>().CountAsync(e => e.PublishedAt == null, ct);

    public Task<int> CountStuckAsync(CancellationToken ct) =>
        db.Set<OutboxEntry>().CountAsync(e => e.PublishedAt == null && e.Attempts >= MaxAttempts, ct);

    public Task<int> DeletePublishedOlderThanAsync(DateTimeOffset cutoff, CancellationToken ct) =>
        db.Set<OutboxEntry>()
            .Where(e => e.PublishedAt != null && e.PublishedAt < cutoff)
            .ExecuteDeleteAsync(ct);
}
