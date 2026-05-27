namespace AiMedincident.Backend.Features.Llm;

public static class LlmModule
{
    public static IServiceCollection AddLlm(this IServiceCollection services)
    {
        services.AddLlmResilience();
        services.AddSingleton<LlmClient>();
        return services;
    }
}
