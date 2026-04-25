namespace AiMedincident.Backend.Features.Nlp;

public static class NlpModule
{
    public static IServiceCollection AddNlp(this IServiceCollection services)
    {
        services.AddSingleton<NlpClient>();
        return services;
    }
}
