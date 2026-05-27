using System.Text.Json;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Nlp.Data;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals;

public class AppealResultPublisher(
    INatsConnection connection,
    INatsJSContext jetStream)
{
    public virtual async Task PublishSuccessAsync(string appealId, NlpAnalyzeResponse result, CancellationToken ct = default)
    {
        var payload = new AppealResultPayload(appealId, result);
        // result- prefix mandatory: submit MsgId=appealId, same stream DuplicateWindow.
        var opts = new NatsJSPubOpts { MsgId = $"result-{appealId}" };
        await jetStream.PublishAsync(
            AppealsStreamConfig.ResultSubject(appealId),
            payload,
            opts: opts,
            cancellationToken: ct);
    }

    public virtual async Task PublishErrorAsync(string appealId, string error, CancellationToken ct = default)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new AppealErrorResult(appealId, error));
        await connection.PublishAsync(
            AppealsStreamConfig.ResultSubject(appealId),
            bytes,
            cancellationToken: ct);
    }
}
