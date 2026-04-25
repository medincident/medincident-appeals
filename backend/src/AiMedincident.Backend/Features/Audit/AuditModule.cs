namespace AiMedincident.Backend.Features.Audit;

public static class AuditModule
{
    public static IServiceCollection AddAudit(this IServiceCollection services)
    {
        services.AddScoped<AuditService>();
        return services;
    }
}
