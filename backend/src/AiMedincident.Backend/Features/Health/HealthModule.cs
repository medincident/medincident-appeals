using AiMedincident.Backend.Shared.Persistence;

namespace AiMedincident.Backend.Features.Health;

public static class HealthModule
{
    public static IServiceCollection AddAppHealthChecks(this IServiceCollection services)
    {
        services.AddHealthChecks()
            .AddDbContextCheck<AppDbContext>("postgres", tags: ["ready"])
            .AddCheck<NatsHealthCheck>("nats", tags: ["ready"])
            .AddCheck<AppealsConsumerHealthCheck>("appeals_consumer", tags: ["ready"])
            .AddCheck<OutboxStuckHealthCheck>("outbox_stuck", tags: ["live"]);

        return services;
    }
}
