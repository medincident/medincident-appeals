using AiMedincident.Backend.Features.Appeals.Outbox;
using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

// Идентичность обновлённого обращения для построения SSE-status-события.
public sealed record AppealRef(Guid Id, string? UserId);

public sealed class AppealsRepository(AppDbContext db)
{
    public const int DefaultListLimit = 200;
    public const int MaxListLimit = 500;

    public async Task UpsertAsync(Appeal appeal, CancellationToken ct = default) =>
        await UpsertWithOutboxAsync(appeal, outbox: null, ct);

    public async Task UpsertWithOutboxAsync(Appeal appeal, OutboxEntry? outbox, CancellationToken ct = default)
    {
        var existing = await db.Set<Appeal>().FirstOrDefaultAsync(a => a.Id == appeal.Id, ct);

        if (existing is null)
        {
            db.Add(appeal);
        }
        else
        {
            existing.FormalizedText = appeal.FormalizedText;
            existing.IsImportant = appeal.IsImportant;
            existing.ImportantConfidence = appeal.ImportantConfidence;
            existing.CategoryId = appeal.CategoryId;
            existing.CategoryName = appeal.CategoryName;
            existing.SubcategoryId = appeal.SubcategoryId;
            existing.SubcategoryName = appeal.SubcategoryName;
            existing.Status = appeal.Status;
        }

        if (outbox is not null)
        {
            db.Add(outbox);
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task AddOutboxEntryAsync(OutboxEntry entry, CancellationToken ct = default)
    {
        db.Add(entry);
        await db.SaveChangesAsync(ct);
    }

    public async Task EnqueueAsync(Guid id, string userId, string text, DateTimeOffset createdAt, CancellationToken ct = default)
    {
        var existing = await db.Set<Appeal>().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (existing is not null) return;

        db.Add(new Appeal
        {
            Id = id,
            UserId = userId,
            Text = text,
            Status = AppealStatus.Pending,
            CreatedAt = createdAt == default ? DateTimeOffset.UtcNow : createdAt,
        });

        await db.SaveChangesAsync(ct);
    }

    public Task<int> SetStatusAsync(Guid id, AppealStatus status, CancellationToken ct = default) =>
        db.Set<Appeal>()
            .Where(a => a.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, status), ct);

    // Сохраняет bufferId medincident-backend и переводит обращение в submitted.
    public Task<int> SetSubmittedAsync(Guid id, Guid bufferId, CancellationToken ct = default) =>
        db.Set<Appeal>()
            .Where(a => a.Id == id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.BufferId, bufferId)
                .SetProperty(a => a.Status, AppealStatus.Submitted), ct);

    // Обновляет статус по bufferId + пишет SSE-status-событие в outbox.
    // Возвращает (appealId, userId) обновлённого обращения или null.
    public async Task<AppealRef?> SetStatusByBufferAsync(Guid bufferId, AppealStatus status, CancellationToken ct = default)
    {
        var target = await FindRefAsync(a => a.BufferId == bufferId, ct);
        if (target is null) return null;
        await db.Set<Appeal>().Where(a => a.BufferId == bufferId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, status), ct);
        await EmitStatusAsync(target, status, ct);
        return target;
    }

    // incident.created из нашего буфера: сохраняем incidentId и статус (accepted).
    public async Task<AppealRef?> SetIncidentByBufferAsync(Guid bufferId, Guid incidentId, AppealStatus status, CancellationToken ct = default)
    {
        var target = await FindRefAsync(a => a.BufferId == bufferId, ct);
        if (target is null) return null;
        await db.Set<Appeal>().Where(a => a.BufferId == bufferId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.IncidentId, incidentId).SetProperty(a => a.Status, status), ct);
        await EmitStatusAsync(target, status, ct);
        return target;
    }

    // incident.status_changed: терминальные done/rejected → closed (по incidentId).
    public async Task<AppealRef?> SetStatusByIncidentAsync(Guid incidentId, AppealStatus status, CancellationToken ct = default)
    {
        var target = await FindRefAsync(a => a.IncidentId == incidentId, ct);
        if (target is null) return null;
        await db.Set<Appeal>().Where(a => a.IncidentId == incidentId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, status), ct);
        await EmitStatusAsync(target, status, ct);
        return target;
    }

    private Task<AppealRef?> FindRefAsync(
        System.Linq.Expressions.Expression<Func<Appeal, bool>> predicate, CancellationToken ct) =>
        db.Set<Appeal>().AsNoTracking()
            .Where(predicate)
            .Select(a => new AppealRef(a.Id, a.UserId))
            .FirstOrDefaultAsync(ct);

    private async Task EmitStatusAsync(AppealRef target, AppealStatus status, CancellationToken ct)
    {
        db.Add(OutboxEventBuilder.StatusResult(target.Id, target.UserId, status));
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<Appeal>> ListAsync(ListFilter filter, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(filter.UserId);

        var limit = filter.Limit is <= 0 or > MaxListLimit ? DefaultListLimit : filter.Limit;

        var query = db.Set<Appeal>()
            .AsNoTracking()
            .Where(a => a.UserId == filter.UserId);

        if (!string.IsNullOrEmpty(filter.Search))
        {
            var pattern = $"%{EscapeEscapes(filter.Search)}%";
            query = query.Where(a =>
                EF.Functions.ILike(a.Text, pattern, "\\") ||
                EF.Functions.ILike(a.FormalizedText, pattern, "\\"));
        }

        if (!string.IsNullOrEmpty(filter.CategoryId))
            query = query.Where(a => a.CategoryId == filter.CategoryId);

        if (!string.IsNullOrEmpty(filter.SubcategoryId))
            query = query.Where(a => a.SubcategoryId == filter.SubcategoryId);

        return await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task<int> DeleteByIdAsync(Guid id, string userId, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(userId);
        return await db.Set<Appeal>()
            .Where(a => a.Id == id && a.UserId == userId)
            .ExecuteDeleteAsync(ct);
    }

    public async Task<int> DeleteOlderThanAsync(DateTimeOffset cutoff, CancellationToken ct = default) =>
        await db.Set<Appeal>()
            .Where(a => a.CreatedAt < cutoff)
            .ExecuteDeleteAsync(ct);

    public async Task<IReadOnlyList<Appeal>> ListUnprocessedAsync(
        DateTimeOffset? olderThan,
        int limit,
        CancellationToken ct = default)
    {
        var query = db.Set<Appeal>()
            .AsNoTracking()
            .Where(a => a.Status == AppealStatus.Pending || a.Status == AppealStatus.Processing);

        if (olderThan.HasValue)
            query = query.Where(a => a.CreatedAt <= olderThan.Value);

        return await query
            .OrderBy(a => a.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
    }

    private static string EscapeEscapes(string search) =>
        search.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
