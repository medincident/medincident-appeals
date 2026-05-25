using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealResultPayload
{
    [JsonPropertyName("id")] public string Id { get; init; }
    [JsonPropertyName("is_important")] public bool IsImportant { get; init; }
    [JsonPropertyName("important_confidence")] public double ImportantConfidence { get; init; }
    [JsonPropertyName("formalized_text")] public string? FormalizedText { get; init; }
    [JsonPropertyName("category")] public IReadOnlyDictionary<string, string>? Category { get; init; }
    [JsonPropertyName("subcategory")] public IReadOnlyDictionary<string, string>? Subcategory { get; init; }

    public AppealResultPayload(string id, NlpAnalyzeResponse r)
    {
        Id = id;
        IsImportant = r.IsImportant;
        ImportantConfidence = r.ImportantConfidence;
        FormalizedText = r.FormalizedText;
        Category = r.Category;
        Subcategory = r.Subcategory;
    }
}
