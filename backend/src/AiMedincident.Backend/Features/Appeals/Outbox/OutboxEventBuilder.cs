using System.Text.Json;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.Features.Appeals.Outbox;

public static class OutboxEventBuilder
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static OutboxEntry SuccessResult(Guid appealId, NlpAnalyzeResponse result)
    {
        var payload = new AppealResultPayload(appealId.ToString(), result);
        return new OutboxEntry
        {
            Id = Guid.NewGuid(),
            AggregateId = appealId,
            Subject = AppealsStreamConfig.ResultSubject(appealId.ToString()),
            MsgId = $"result-{appealId}",
            PayloadJson = JsonSerializer.Serialize(payload, JsonOptions),
            CreatedAt = DateTimeOffset.UtcNow,
        };
    }

    public static OutboxEntry ErrorResult(Guid appealId, string error)
    {
        var payload = new AppealErrorResult(appealId.ToString(), error);
        return new OutboxEntry
        {
            Id = Guid.NewGuid(),
            AggregateId = appealId,
            Subject = AppealsStreamConfig.ResultSubject(appealId.ToString()),
            MsgId = $"error-{appealId}-{Guid.NewGuid():N}",
            PayloadJson = JsonSerializer.Serialize(payload, JsonOptions),
            CreatedAt = DateTimeOffset.UtcNow,
        };
    }
}
