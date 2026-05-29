using AiMedincident.Backend.Shared.Configuration;

namespace AiMedincident.Backend.Features.MedincidentBackend;

public static class MedincidentBackendModule
{
    public static IServiceCollection AddMedincidentBackend(this IServiceCollection services, AppOptions options)
    {
        if (!options.Medincident.Enabled)
            return services;

        services.AddHttpClient(MedincidentSubmissionClient.HttpClientName,
                static c => c.Timeout = TimeSpan.FromSeconds(10))
            .AddStandardResilienceHandler();
        services.AddSingleton<MedincidentSubmissionClient>();

        services.AddHostedService<BackendEventConsumer>();
        return services;
    }
}
