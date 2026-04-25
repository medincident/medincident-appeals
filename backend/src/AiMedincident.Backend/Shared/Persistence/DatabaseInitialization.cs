using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.Shared.Persistence;

public static class DatabaseInitialization
{
    public static async Task EnsureSchemaAsync(
        AppDbContext db,
        ILogger? logger = null,
        CancellationToken ct = default,
        int attempts = 20,
        TimeSpan? delay = null)
    {
        var retryDelay = delay ?? TimeSpan.FromSeconds(2);
        Exception? last = null;

        for (var i = 1; i <= attempts; i++)
        {
            try
            {
                await db.Database.MigrateAsync(ct);
                logger?.LogInformation("database migrated");
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                logger?.LogWarning(
                    "postgres error (attempt {Attempt}/{Max}): {Error}",
                    i, attempts, ex.Message);
                try
                {
                    await Task.Delay(retryDelay, ct);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }

        throw new InvalidOperationException("postgres migrations failed", last);
    }
}
