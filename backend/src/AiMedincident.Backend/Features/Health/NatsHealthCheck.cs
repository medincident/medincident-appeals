using Microsoft.Extensions.Diagnostics.HealthChecks;
using NATS.Client.Core;

namespace AiMedincident.Backend.Features.Health;

public sealed class NatsHealthCheck(INatsConnection connection) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(connection.ConnectionState == NatsConnectionState.Open
            ? HealthCheckResult.Healthy($"state={connection.ConnectionState}")
            : HealthCheckResult.Unhealthy($"state={connection.ConnectionState}"));
}
