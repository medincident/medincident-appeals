using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

public sealed class AppealsDlqRepository(AppDbContext db)
{
    public const int DefaultListLimit = 200;
    public const int MaxListLimit = 500;

    /// <summary>
    /// Идемпотентно: повторный вызов для того же appealId обновляет запись
    /// (увеличивает delivery_count, перезаписывает last_error / failure_type).
    /// </summary>
    public async Task UpsertAsync(AppealDlqEntry entry, CancellationToken ct = default)
    {
        var existing = await db.Set<AppealDlqEntry>().FirstOrDefaultAsync(e => e.Id == entry.Id, ct);

        if (existing is null)
        {
            db.Add(entry);
        }
        else
        {
            existing.UserId = entry.UserId;
            existing.Text = entry.Text;
            existing.CreatedAt = entry.CreatedAt;
            existing.FailedAt = entry.FailedAt;
            existing.DeliveryCount = entry.DeliveryCount;
            existing.LastError = entry.LastError;
            existing.FailureType = entry.FailureType;
            existing.PayloadJson = entry.PayloadJson;
        }

        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<AppealDlqEntry>> ListRecentAsync(int limit, CancellationToken ct = default)
    {
        var capped = limit is <= 0 or > MaxListLimit ? DefaultListLimit : limit;
        return await db.Set<AppealDlqEntry>()
            .AsNoTracking()
            .OrderByDescending(e => e.FailedAt)
            .Take(capped)
            .ToListAsync(ct);
    }

    public Task<int> CountAsync(CancellationToken ct = default) =>
        db.Set<AppealDlqEntry>().CountAsync(ct);

    public Task<int> CountByTypeAsync(DlqFailureType type, CancellationToken ct = default) =>
        db.Set<AppealDlqEntry>().CountAsync(e => e.FailureType == type, ct);
}
