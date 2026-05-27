using System.Text.Json.Serialization;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealErrorResult(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("user_id")] string? UserId,
    [property: JsonPropertyName("error")] string Error);
