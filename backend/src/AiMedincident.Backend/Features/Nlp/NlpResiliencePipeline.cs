using AiMedincident.Backend.Features.Nlp.Metrics;
using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Options;
using Polly;
using Polly.CircuitBreaker;
using Polly.RateLimiting;
using Polly.Timeout;
using System.Threading.RateLimiting;

namespace AiMedincident.Backend.Features.Nlp;

public static class NlpResiliencePipeline
{
    public const string PipelineKey = "nlp-analyze";

    public static IServiceCollection AddNlpResilience(this IServiceCollection services)
    {
        services.AddResiliencePipeline<string, byte[]>(PipelineKey, (builder, ctx) =>
        {
            var opt = ctx.ServiceProvider.GetRequiredService<IOptions<AppOptions>>().Value.Nlp;
            var logger = ctx.ServiceProvider.GetRequiredService<ILogger<NlpClient>>();
            var metrics = ctx.ServiceProvider.GetRequiredService<AnalyzeMetrics>();

            builder
                .AddRateLimiter(new ConcurrencyLimiter(new ConcurrencyLimiterOptions
                {
                    PermitLimit = opt.MaxConcurrency,
                    QueueLimit = opt.QueueLimit,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                }))
                .AddCircuitBreaker(new CircuitBreakerStrategyOptions<byte[]>
                {
                    FailureRatio = opt.CircuitFailureRatio,
                    MinimumThroughput = opt.CircuitMinThroughput,
                    SamplingDuration = TimeSpan.FromSeconds(opt.CircuitSamplingSeconds),
                    BreakDuration = TimeSpan.FromSeconds(opt.CircuitBreakSeconds),
                    ShouldHandle = new PredicateBuilder<byte[]>()
                        .Handle<NlpException>()
                        .Handle<TimeoutRejectedException>(),
                    OnOpened = args =>
                    {
                        logger.LogWarning(
                            "NLP circuit opened (break={BreakDuration}s, lastError={Error})",
                            args.BreakDuration.TotalSeconds,
                            args.Outcome.Exception?.Message);
                        metrics.SetNlpCircuitState(AnalyzeMetrics.CircuitOpen);
                        return default;
                    },
                    OnClosed = _ =>
                    {
                        logger.LogInformation("NLP circuit closed");
                        metrics.SetNlpCircuitState(AnalyzeMetrics.CircuitClosed);
                        return default;
                    },
                    OnHalfOpened = _ =>
                    {
                        logger.LogInformation("NLP circuit half-open: trial in progress");
                        metrics.SetNlpCircuitState(AnalyzeMetrics.CircuitHalfOpen);
                        return default;
                    },
                })
                .AddTimeout(TimeSpan.FromSeconds(opt.TimeoutSeconds));
        });

        return services;
    }
}
