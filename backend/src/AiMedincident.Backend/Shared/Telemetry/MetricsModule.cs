using AiMedincident.Backend.Features.Appeals.Metrics;
using AiMedincident.Backend.Features.Nlp.Metrics;
using OpenTelemetry.Metrics;

namespace AiMedincident.Backend.Shared.Telemetry;

public static class MetricsModule
{
    public static IServiceCollection AddAppMetrics(this IServiceCollection services)
    {
        services.AddSingleton<AppealsMetrics>();
        services.AddSingleton<OutboxMetrics>();
        services.AddSingleton<AnalyzeMetrics>();

        services.AddOpenTelemetry()
            .WithMetrics(b => b
                .AddMeter(AppealsMetrics.MeterName)
                .AddMeter(OutboxMetrics.MeterName)
                .AddMeter(AnalyzeMetrics.MeterName)
                .AddAspNetCoreInstrumentation()
                .AddRuntimeInstrumentation()
                .AddPrometheusExporter());

        return services;
    }
}
