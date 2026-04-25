using AiMedincident.Backend.Shared.Persistence;

namespace AiMedincident.Backend.Features.Audit;

public sealed class AuditService(AppDbContext db, ILogger<AuditService> logger)
{
    public async Task RecordAsync(string userId, string action, Guid? appealId, string? ip, CancellationToken ct = default)
    {
        try
        {
            db.Set<AuditEntry>().Add(new AuditEntry
            {
                UserId = userId,
                Action = action,
                AppealId = appealId,
                Ip = ip,
                CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "audit write failed (user={UserId}, action={Action})", userId, action);
        }
    }
}
