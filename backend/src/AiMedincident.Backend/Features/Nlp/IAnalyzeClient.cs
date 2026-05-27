using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.Features.Nlp;

public interface IAnalyzeClient
{
    Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default);
}
