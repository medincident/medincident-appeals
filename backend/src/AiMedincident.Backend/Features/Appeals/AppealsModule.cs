using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;

namespace AiMedincident.Backend.Features.Appeals;

public static class AppealsModule
{
    public static IServiceCollection AddAppeals(this IServiceCollection services)
    {
        services.AddScoped<AppealsRepository>();
        services.AddScoped<AppealsProcessor>();
        services.AddSingleton<AppealResultPublisher>();
        services.AddSingleton<AppealsConsumer>();
        services.AddHostedService(static sp => sp.GetRequiredService<AppealsConsumer>());
        services.AddHostedService<AppealsResubmitService>();
        return services;
    }
}
