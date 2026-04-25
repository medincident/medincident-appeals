using System.Text.Json;
using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp.Data;
using NATS.Client.Core;

namespace AiMedincident.Backend.Features.Nlp;

public class NlpClient(INatsConnection nats, IHostEnvironment env)
{
    public const string AnalyzeSubject = "nlp.analyze";
    public const string ErrorHeader = "Nats-Error";
    public static readonly TimeSpan AnalyzeTimeout = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public virtual async Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(text);

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(AnalyzeTimeout);

        var requestBytes = JsonSerializer.SerializeToUtf8Bytes(new AnalyzeRequest(text), JsonOptions);

        NatsMsg<byte[]> reply;
        try
        {
            reply = await nats.RequestAsync<byte[], byte[]>(
                AnalyzeSubject,
                requestBytes,
                cancellationToken: cts.Token);
        }
        catch (NatsNoRespondersException)
        {
            throw new NlpException("no nlp-service workers available");
        }

        if (reply.Headers is not null && reply.Headers.TryGetValue(ErrorHeader, out var errValues) && errValues.Count > 0)
        {
            var errMessage = env.IsDevelopment()
                ? $"nlp-service: {errValues[0]}"
                : "nlp-service error";
            throw new NlpException(errMessage);
        }

        if (reply.Data is null || reply.Data.Length == 0)
            throw new NlpException("nlp-service returned empty body");

        var result = JsonSerializer.Deserialize<NlpAnalyzeResponse>(reply.Data, JsonOptions);
        return result ?? throw new NlpException("nlp-service returned null");
    }

    private sealed record AnalyzeRequest([property: JsonPropertyName("text")] string Text);
}

public sealed class NlpException(string message) : Exception(message);
