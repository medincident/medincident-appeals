using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Appeals.Data.Db;

namespace AiMedincident.Backend.Features.Appeals.Data;

// SSE-событие обновления статуса обращения (после отправки в medincident-backend).
// Несёт status, чтобы фронт обновил карточку без рефетча списка.
public sealed record AppealStatusPayload(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("user_id")] string? UserId,
    [property: JsonPropertyName("status")] AppealStatus Status);
