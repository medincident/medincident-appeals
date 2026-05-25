using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Audit;
using AiMedincident.Backend.Features.Auth;

namespace AiMedincident.Backend.Features.Appeals;

public static class AppealsEndpoints
{
    internal static readonly TimeSpan ListTimeout = TimeSpan.FromSeconds(10);

    public static IEndpointRouteBuilder MapAppealsEndpoints(this IEndpointRouteBuilder app)
    {
        var users = app.MapGroup("/users/{userId}").AddEndpointFilter<UserAuthFilter>();
        users.MapGet("/appeals", ListAppealsAsync);
        users.MapDelete("/appeals/{id:guid}", DeleteAppealAsync);
        return app;
    }

    internal static async Task<IResult> ListAppealsAsync(
        string userId,
        AppealsRepository repository,
        AuditService audit,
        HttpContext http,
        CancellationToken requestAborted,
        string? search = null,
        string? category = null,
        string? subcategory = null)
    {
        var filter = new ListFilter(
            UserId: userId,
            Search: search?.Trim(),
            CategoryId: category?.Trim(),
            SubcategoryId: subcategory?.Trim(),
            Limit: 0);

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        cts.CancelAfter(ListTimeout);

        var rows = await repository.ListAsync(filter, cts.Token);
        await audit.RecordAsync(userId, "appeals.list", null, ClientIp(http), cts.Token);
        return TypedResults.Ok(new { appeals = rows.Select(ToDto).ToList() });
    }

    internal static async Task<IResult> DeleteAppealAsync(
        string userId,
        Guid id,
        AppealsRepository repository,
        AuditService audit,
        HttpContext http,
        CancellationToken requestAborted)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        cts.CancelAfter(ListTimeout);

        var deleted = await repository.DeleteByIdAsync(id, userId, cts.Token);
        if (deleted == 0)
            return TypedResults.NotFound();

        await audit.RecordAsync(userId, "appeals.delete", id, ClientIp(http), cts.Token);
        return TypedResults.NoContent();
    }

    private static string? ClientIp(HttpContext http) =>
        http.Connection.RemoteIpAddress?.ToString();

    private static AppealDto ToDto(Appeal a) => new(
        a.Id, a.UserId, a.Text, a.FormalizedText, a.IsImportant,
        a.ImportantConfidence,
        a.CategoryId, a.CategoryName, a.SubcategoryId, a.SubcategoryName,
        a.Status, a.CreatedAt);
}
