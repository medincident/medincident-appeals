namespace AiMedincident.Backend.Features.Appeals;

public sealed record ListFilter(
    string UserId,
    string? Search,
    string? CategoryId,
    string? SubcategoryId,
    int Limit);
