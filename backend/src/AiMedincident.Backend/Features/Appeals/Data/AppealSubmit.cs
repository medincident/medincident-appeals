using System.Text.Json.Serialization;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealSubmit(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("user_id")] string? UserId,
    [property: JsonPropertyName("created_at")] string? CreatedAt,
    // Bearer пациента для submit в medincident-backend (caller → patientZitadelUserId).
    // Проносится через очередь: обработка асинхронная, HTTP-контекст уже недоступен.
    [property: JsonPropertyName("access_token")] string? AccessToken = null);
