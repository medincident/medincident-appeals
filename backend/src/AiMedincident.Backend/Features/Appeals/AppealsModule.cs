using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Appeals.Outbox;

namespace AiMedincident.Backend.Features.Appeals;

public static class AppealsModule
{
    public static IServiceCollection AddAppeals(this IServiceCollection services)
    {
        services.AddScoped<AppealsRepository>();
        services.AddScoped<AppealsDlqRepository>();
        services.AddScoped<OutboxRepository>();
        services.AddScoped<AppealsProcessor>();
        services.AddSingleton<AppealsConsumer>();
        services.AddHostedService(static sp => sp.GetRequiredService<AppealsConsumer>());
        services.AddHostedService<AppealsResubmitService>();
        services.AddHostedService<OutboxPublisher>();
        return services;
    }
}
