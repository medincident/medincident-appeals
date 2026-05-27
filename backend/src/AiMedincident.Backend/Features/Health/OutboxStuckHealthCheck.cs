using AiMedincident.Backend.Features.Appeals.Data.Db;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AiMedincident.Backend.Features.Health;

public sealed class OutboxStuckHealthCheck(IServiceScopeFactory scopeFactory) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<OutboxRepository>();
            var stuck = await repo.CountStuckAsync(cancellationToken);

            return stuck == 0
                ? HealthCheckResult.Healthy("no stuck outbox entries")
                : HealthCheckResult.Degraded($"{stuck} outbox entries exceeded MaxAttempts");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("failed to query outbox", ex);
        }
    }
}
