using System.Text.Json.Serialization;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealErrorResult(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("error")] string Error);
