using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp;
using AiMedincident.Backend.Features.Nlp.Data;
using AiMedincident.Backend.Features.Nlp.Metrics;
using NATS.Client.Core;
using Polly;
using Polly.RateLimiting;
using Polly.Registry;
using Polly.Timeout;

namespace AiMedincident.Backend.Features.Llm;

public class LlmClient : IAnalyzeClient
{
    public const string AnalyzeSubject = "llm.analyze";
    public const string ErrorHeader = "Nats-Error";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly INatsConnection _nats;
    private readonly IHostEnvironment _env;
    private readonly ResiliencePipeline<byte[]> _pipeline;
    private readonly AnalyzeMetrics? _metrics;

    public LlmClient(
        INatsConnection nats,
        IHostEnvironment env,
        ResiliencePipelineProvider<string> pipelineProvider,
        AnalyzeMetrics metrics)
    {
        _nats = nats;
        _env = env;
        _pipeline = pipelineProvider.GetPipeline<byte[]>(LlmResiliencePipeline.PipelineKey);
        _metrics = metrics;
    }

    protected LlmClient(INatsConnection nats, IHostEnvironment env)
    {
        _nats = nats;
        _env = env;
        _pipeline = ResiliencePipeline<byte[]>.Empty;
        _metrics = null;
    }

    internal LlmClient(INatsConnection nats, IHostEnvironment env, ResiliencePipeline<byte[]> pipeline)
    {
        _nats = nats;
        _env = env;
        _pipeline = pipeline;
        _metrics = null;
    }

    public virtual async Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(text);

        var requestBytes = JsonSerializer.SerializeToUtf8Bytes(new AnalyzeRequest(text), JsonOptions);
        var sw = Stopwatch.StartNew();

        byte[] replyBytes;
        try
        {
            replyBytes = await _pipeline.ExecuteAsync(
                async token => await CallNatsAsync(requestBytes, token),
                ct);
        }
        catch (RateLimiterRejectedException ex)
        {
            _metrics?.RecordRequest(AnalyzeMetrics.ClientLlm, AnalyzeMetrics.OutcomeBulkheadReject, sw.Elapsed.TotalSeconds);
            throw new LlmBulkheadRejectedException("llm-service over capacity", ex);
        }
        catch (TimeoutRejectedException ex)
        {
            _metrics?.RecordRequest(AnalyzeMetrics.ClientLlm, AnalyzeMetrics.OutcomeTimeout, sw.Elapsed.TotalSeconds);
            throw new LlmTimeoutException("llm-service timeout", ex);
        }
        catch (LlmException)
        {
            _metrics?.RecordRequest(AnalyzeMetrics.ClientLlm, AnalyzeMetrics.OutcomeError, sw.Elapsed.TotalSeconds);
            throw;
        }

        _metrics?.RecordRequest(AnalyzeMetrics.ClientLlm, AnalyzeMetrics.OutcomeSuccess, sw.Elapsed.TotalSeconds);

        var result = JsonSerializer.Deserialize<NlpAnalyzeResponse>(replyBytes, JsonOptions);
        return result ?? throw new LlmException("llm-service returned null");
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
            throw new LlmException("no llm-service workers available");
        }

        if (reply.Headers is not null && reply.Headers.TryGetValue(ErrorHeader, out var errValues) && errValues.Count > 0)
        {
            var errMessage = _env.IsDevelopment()
                ? $"llm-service: {errValues[0]}"
                : "llm-service error";
            throw new LlmException(errMessage);
        }

        if (reply.Data is null || reply.Data.Length == 0)
            throw new LlmException("llm-service returned empty body");

        return reply.Data;
    }

    private sealed record AnalyzeRequest([property: JsonPropertyName("text")] string Text);
}
