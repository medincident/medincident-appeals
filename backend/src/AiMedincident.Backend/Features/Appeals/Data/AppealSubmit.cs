using System.Text.Json.Serialization;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealSubmit(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("user_id")] string? UserId,
    [property: JsonPropertyName("created_at")] string? CreatedAt);
