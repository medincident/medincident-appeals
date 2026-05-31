using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp.Data;
using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Options;

namespace AiMedincident.Backend.Features.MedincidentBackend;

// POST /v1/patient-incidents под bearer-токеном пациента — caller становится
// patientZitadelUserId записи буфера. Возвращает её bufferId.
public sealed class MedincidentSubmissionClient(
    IHttpClientFactory httpClientFactory,
    IOptions<AppOptions> options,
    ILogger<MedincidentSubmissionClient> logger)
{
    internal const string HttpClientName = "medincident";

    private readonly MedincidentOptions _opts = options.Value.Medincident;

    // Возвращает bufferId при успехе. Бросает при ошибке (401/5xx) — вызывающий
    // переводит обращение в retry/DLQ.
    public async Task<Guid> SubmitAsync(
        string accessToken,
        string summary,
        string description,
        string priority,
        string? categoryId,
        string? typeId,
        string? occurredAt = null,
        CancellationToken ct = default)
    {
        var body = new SubmitRequestBody
        {
            OrganizationId = _opts.OrgId,
            Summary = summary,
            Description = description,
            Priority = priority,
            // Моковые cat_*/sub_* — не UUID: не шлём, диспетчер выберет вручную.
            CategoryId = AsUuidOrNull(categoryId),
            TypeId = AsUuidOrNull(typeId),
            OccurredAt = occurredAt,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_opts.ServerUrl.TrimEnd('/')}/v1/patient-incidents")
        {
            Content = JsonContent.Create(body),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var client = httpClientFactory.CreateClient(HttpClientName);
        using var resp = await client.SendAsync(req, ct);
        if (!resp.IsSuccessStatusCode)
        {
            // DEBUG: gateway возвращает тело с причиной ошибки (400/4xx), но
            // EnsureSuccessStatusCode её отбрасывает. Читаем и логируем, чтобы
            // увидеть, на что именно жалуется medincident-backend.
            var errBody = await resp.Content.ReadAsStringAsync(ct);
            logger.LogError(
                "medincident-backend rejected submit (status={Status}): {Body}",
                (int)resp.StatusCode, errBody);
        }
        resp.EnsureSuccessStatusCode();

        var result = await resp.Content.ReadFromJsonAsync<SubmitResponseBody>(ct);
        if (result is null || string.IsNullOrEmpty(result.BufferId) || !Guid.TryParse(result.BufferId, out var bufferId))
            throw new InvalidOperationException("medincident-backend returned no/invalid bufferId");

        logger.LogInformation("Submitted patient incident to medincident-backend (bufferId={BufferId})", bufferId);
        return bufferId;
    }

    private static string? AsUuidOrNull(string? value) =>
        !string.IsNullOrEmpty(value) && Guid.TryParse(value, out _) ? value : null;

    private sealed record SubmitRequestBody
    {
        [JsonPropertyName("organizationId")] public string OrganizationId { get; init; } = "";
        [JsonPropertyName("summary")] public string Summary { get; init; } = "";
        [JsonPropertyName("description")] public string Description { get; init; } = "";
        [JsonPropertyName("priority")] public string Priority { get; init; } = "";
        [JsonPropertyName("categoryId")] public string? CategoryId { get; init; }
        [JsonPropertyName("typeId")] public string? TypeId { get; init; }
        [JsonPropertyName("occurredAt")] public string? OccurredAt { get; init; }
    }

    private sealed record SubmitResponseBody(
        [property: JsonPropertyName("bufferId")] string? BufferId);
}

public static class SubmitMapping
{
    // description = ИСХОДНЫЙ текст пациента (по контракту gateway — Buffer.md).
    public static string Description(string originalText) => originalText;

    // summary = AI-формализованный текст; fallback на исходный, если формализации нет.
    public static string Summary(NlpAnalyzeResponse? nlp, string originalText) =>
        !string.IsNullOrWhiteSpace(nlp?.FormalizedText) ? nlp!.FormalizedText! : originalText;

    // occurred_at = время подачи обращения в RFC3339Nano (формат "O").
    // Возвращает null, если дату не распарсить — поле опционально, шлём только валидное.
    public static string? OccurredAt(string? createdAtRaw)
    {
        if (string.IsNullOrWhiteSpace(createdAtRaw)) return null;
        return DateTimeOffset.TryParse(
            createdAtRaw,
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AssumeUniversal,
            out var ts)
            ? ts.ToString("O")
            : null;
    }

    // gateway требует priority как protobuf-enum BufferPriority (по имени строкой);
    // допустимы только NORMAL/HIGH. is_important=true → HIGH, иначе NORMAL.
    public static string Priority(NlpAnalyzeResponse? nlp) =>
        nlp?.IsImportant == true ? "BUFFER_PRIORITY_HIGH" : "BUFFER_PRIORITY_NORMAL";

    public static string? CategoryId(NlpAnalyzeResponse? nlp) =>
        nlp?.Category is { } c && c.TryGetValue("id", out var id) ? id : null;

    // Подкатегория AI = тип инцидента backend.
    public static string? TypeId(NlpAnalyzeResponse? nlp) =>
        nlp?.Subcategory is { } s && s.TryGetValue("id", out var id) ? id : null;
}
