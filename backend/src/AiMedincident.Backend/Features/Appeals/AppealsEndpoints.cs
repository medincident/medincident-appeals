using System.Text;
using System.Text.Json;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Audit;
using AiMedincident.Backend.Features.Auth;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals;

public static class AppealsEndpoints
{
    internal static readonly TimeSpan ListTimeout = TimeSpan.FromSeconds(10);
    internal static readonly TimeSpan SubmitTimeout = TimeSpan.FromSeconds(5);
    internal const int MaxAppealTextLength = 8 * 1024;

    private static readonly JsonSerializerOptions SubmitJsonOptions = new(JsonSerializerDefaults.Web);

    public static IEndpointRouteBuilder MapAppealsEndpoints(this IEndpointRouteBuilder app)
    {
        var users = app.MapGroup("/users/{userId}").AddEndpointFilter<UserAuthFilter>();
        users.MapGet("/appeals", ListAppealsAsync);
        users.MapPost("/appeals", SubmitAppealAsync);
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

    internal sealed record SubmitAppealRequest(string Text, string? IdempotencyKey);

    internal sealed record SubmitAppealResponse(Guid Id, string CreatedAt);

    internal static async Task<IResult> SubmitAppealAsync(
        string userId,
        SubmitAppealRequest request,
        INatsJSContext jetStream,
        AuditService audit,
        HttpContext http,
        CancellationToken requestAborted)
    {
        var text = request.Text?.Trim();
        if (string.IsNullOrEmpty(text))
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, title: "empty text");
        if (text.Length > MaxAppealTextLength)
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, title: "text too long");

        var id = Guid.NewGuid();
        var createdAt = DateTimeOffset.UtcNow;
        var msgId = string.IsNullOrWhiteSpace(request.IdempotencyKey)
            ? id.ToString()
            : request.IdempotencyKey!.Trim();

        // Захватываем bearer пациента — под ним обращение уйдёт в medincident-backend
        // в асинхронной обработке (HTTP-контекст там уже недоступен).
        var accessToken = ExtractBearer(http.Request.Headers.Authorization.ToString());

        var submit = new AppealSubmit(
            Id: id.ToString(),
            Text: text,
            UserId: userId,
            CreatedAt: createdAt.ToString("O"),
            AccessToken: accessToken);

        var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(submit, SubmitJsonOptions));

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        cts.CancelAfter(SubmitTimeout);

        try
        {
            await jetStream.PublishAsync(
                AppealsStreamConfig.SubmitSubject,
                payload,
                opts: new NatsJSPubOpts { MsgId = msgId },
                cancellationToken: cts.Token);
        }
        catch (Exception) when (!requestAborted.IsCancellationRequested)
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "submit queue unavailable");
        }

        await audit.RecordAsync(userId, "appeals.submit", id, ClientIp(http), requestAborted);
        return TypedResults.Accepted(
            uri: $"/api/v1/users/{userId}/appeals/{id}",
            value: new SubmitAppealResponse(id, createdAt.ToString("O")));
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

    private static string? ExtractBearer(string? authHeader)
    {
        if (string.IsNullOrWhiteSpace(authHeader) ||
            !authHeader.StartsWith("bearer ", StringComparison.OrdinalIgnoreCase))
            return null;
        var token = authHeader["bearer ".Length..].Trim();
        return token.Length == 0 ? null : token;
    }

    private static AppealDto ToDto(Appeal a) => new(
        a.Id, a.UserId, a.Text, a.FormalizedText, a.IsImportant,
        a.ImportantConfidence,
        a.CategoryId, a.CategoryName, a.SubcategoryId, a.SubcategoryName,
        a.Status, a.CreatedAt);
}
