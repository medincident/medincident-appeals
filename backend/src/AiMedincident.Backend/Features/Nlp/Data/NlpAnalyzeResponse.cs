using System.Text.Json.Serialization;

namespace AiMedincident.Backend.Features.Nlp.Data;

public sealed record NlpAnalyzeResponse
{
    [JsonPropertyName("is_important")]
    public bool IsImportant { get; init; }

    [JsonPropertyName("important_confidence")]
    public double ImportantConfidence { get; init; }

    [JsonPropertyName("reason")]
    public string? Reason { get; init; }

    [JsonPropertyName("formalized_text")]
    public string? FormalizedText { get; init; }

    [JsonPropertyName("theses")]
    public IReadOnlyList<string>? Theses { get; init; }

    [JsonPropertyName("category")]
    public IReadOnlyDictionary<string, string>? Category { get; init; }

    [JsonPropertyName("subcategory")]
    public IReadOnlyDictionary<string, string>? Subcategory { get; init; }
}
