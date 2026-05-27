using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Options;
using Polly;
using System.Threading.RateLimiting;

namespace AiMedincident.Backend.Features.Llm;

public static class LlmResiliencePipeline
{
    public const string PipelineKey = "llm-analyze";

    public static IServiceCollection AddLlmResilience(this IServiceCollection services)
    {
        services.AddResiliencePipeline<string, byte[]>(PipelineKey, (builder, ctx) =>
        {
            var opt = ctx.ServiceProvider.GetRequiredService<IOptions<AppOptions>>().Value.Llm;

            builder
                .AddRateLimiter(new ConcurrencyLimiter(new ConcurrencyLimiterOptions
                {
                    PermitLimit = opt.MaxConcurrency,
                    QueueLimit = opt.QueueLimit,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                }))
                .AddTimeout(TimeSpan.FromSeconds(opt.TimeoutSeconds));
        });

        return services;
    }
}
