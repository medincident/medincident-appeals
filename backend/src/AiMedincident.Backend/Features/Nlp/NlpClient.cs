using System.Text.Json;
using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp.Data;
using NATS.Client.Core;
using Polly;
using Polly.CircuitBreaker;
using Polly.RateLimiting;
using Polly.Registry;
using Polly.Timeout;

namespace AiMedincident.Backend.Features.Nlp;

public class NlpClient
{
    public const string AnalyzeSubject = "nlp.analyze";
    public const string ErrorHeader = "Nats-Error";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly INatsConnection _nats;
    private readonly IHostEnvironment _env;
    private readonly ResiliencePipeline<byte[]> _pipeline;

    public NlpClient(
        INatsConnection nats,
        IHostEnvironment env,
        ResiliencePipelineProvider<string> pipelineProvider)
    {
        _nats = nats;
        _env = env;
        _pipeline = pipelineProvider.GetPipeline<byte[]>(NlpResiliencePipeline.PipelineKey);
    }

    protected NlpClient(INatsConnection nats, IHostEnvironment env)
    {
        _nats = nats;
        _env = env;
        _pipeline = ResiliencePipeline<byte[]>.Empty;
    }

    internal NlpClient(INatsConnection nats, IHostEnvironment env, ResiliencePipeline<byte[]> pipeline)
    {
        _nats = nats;
        _env = env;
        _pipeline = pipeline;
    }

    public virtual async Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(text);

        var requestBytes = JsonSerializer.SerializeToUtf8Bytes(new AnalyzeRequest(text), JsonOptions);

        byte[] replyBytes;
        try
        {
            replyBytes = await _pipeline.ExecuteAsync(
                async token => await CallNatsAsync(requestBytes, token),
                ct);
        }
        catch (BrokenCircuitException ex)
        {
            throw new NlpCircuitOpenException("nlp-service circuit open", ex);
        }
        catch (RateLimiterRejectedException ex)
        {
            throw new NlpBulkheadRejectedException("nlp-service over capacity", ex);
        }
        catch (TimeoutRejectedException ex)
        {
            throw new NlpTimeoutException("nlp-service timeout", ex);
        }

        var result = JsonSerializer.Deserialize<NlpAnalyzeResponse>(replyBytes, JsonOptions);
        return result ?? throw new NlpException("nlp-service returned null");
    }

    private async ValueTask<byte[]> CallNatsAsync(byte[] requestBytes, CancellationToken token)
    {
        NatsMsg<byte[]> reply;
        try
        {
            reply = await _nats.RequestAsync<byte[], byte[]>(
                AnalyzeSubject,
                requestBytes,
                cancellationToken: token);
        }
        catch (NatsNoRespondersException)
        {
            throw new NlpException("no nlp-service workers available");
        }

        if (reply.Headers is not null && reply.Headers.TryGetValue(ErrorHeader, out var errValues) && errValues.Count > 0)
        {
            var errMessage = _env.IsDevelopment()
                ? $"nlp-service: {errValues[0]}"
                : "nlp-service error";
            throw new NlpException(errMessage);
        }

        if (reply.Data is null || reply.Data.Length == 0)
            throw new NlpException("nlp-service returned empty body");

        return reply.Data;
    }

    private sealed record AnalyzeRequest([property: JsonPropertyName("text")] string Text);
}
