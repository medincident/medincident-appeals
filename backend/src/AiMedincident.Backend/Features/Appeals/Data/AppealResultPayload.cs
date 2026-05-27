using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealResultPayload
{
    [JsonPropertyName("id")] public string Id { get; init; }
    [JsonPropertyName("user_id")] public string? UserId { get; init; }
    [JsonPropertyName("is_important")] public bool IsImportant { get; init; }
    [JsonPropertyName("important_confidence")] public double ImportantConfidence { get; init; }
    [JsonPropertyName("formalized_text")] public string? FormalizedText { get; init; }
    [JsonPropertyName("category")] public IReadOnlyDictionary<string, string>? Category { get; init; }
    [JsonPropertyName("subcategory")] public IReadOnlyDictionary<string, string>? Subcategory { get; init; }

    public AppealResultPayload(string id, string? userId, NlpAnalyzeResponse r)
    {
        Id = id;
        UserId = userId;
        IsImportant = r.IsImportant;
        ImportantConfidence = r.ImportantConfidence;
        FormalizedText = r.FormalizedText;
        Category = r.Category;
        Subcategory = r.Subcategory;
    }
}
