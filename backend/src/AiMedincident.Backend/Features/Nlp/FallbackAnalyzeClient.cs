using AiMedincident.Backend.Features.Llm;
using AiMedincident.Backend.Features.Nlp.Data;
using AiMedincident.Backend.Features.Nlp.Metrics;

namespace AiMedincident.Backend.Features.Nlp;

public sealed class FallbackAnalyzeClient(
    NlpClient primary,
    LlmClient secondary,
    AnalyzeMetrics metrics,
    ILogger<FallbackAnalyzeClient> logger) : IAnalyzeClient
{
    public async Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
    {
        try
        {
            return await primary.AnalyzeAsync(text, ct);
        }
        catch (NlpException primaryEx)
        {
            logger.LogWarning(
                "Primary nlp-service failed ({Type}: {Message}), falling back to llm-service",
                primaryEx.GetType().Name,
                primaryEx.Message);
            metrics.RecordFallback();

            try
            {
                return await secondary.AnalyzeAsync(text, ct);
            }
            catch (LlmException secondaryEx)
            {
                throw new AggregateAnalyzeException(primaryEx, secondaryEx);
            }
        }
    }
}

public sealed class AggregateAnalyzeException : Exception
{
    public AggregateAnalyzeException(NlpException primary, LlmException secondary)
        : base($"nlp: {primary.Message}; llm: {secondary.Message}", secondary)
    {
        Primary = primary;
        Secondary = secondary;
    }

    public NlpException Primary { get; }
    public LlmException Secondary { get; }
}
