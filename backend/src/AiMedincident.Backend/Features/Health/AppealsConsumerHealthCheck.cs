using AiMedincident.Backend.Features.Appeals;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AiMedincident.Backend.Features.Health;

public sealed class AppealsConsumerHealthCheck(AppealsConsumer consumer) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(consumer.IsActive
            ? HealthCheckResult.Healthy("consumer running")
            : HealthCheckResult.Degraded("consumer not active"));
}
