using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Appeals.Data.Db;

namespace AiMedincident.Backend.Features.Appeals.Data;

public sealed record AppealDto(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("user_id")] string UserId,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("formalized_text")] string FormalizedText,
    [property: JsonPropertyName("is_important")] bool IsImportant,
    [property: JsonPropertyName("important_confidence")] float? ImportantConfidence,
    [property: JsonPropertyName("category_id")] string? CategoryId,
    [property: JsonPropertyName("category_name")] string? CategoryName,
    [property: JsonPropertyName("subcategory_id")] string? SubcategoryId,
    [property: JsonPropertyName("subcategory_name")] string? SubcategoryName,
    [property: JsonPropertyName("status")] AppealStatus Status,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt);
