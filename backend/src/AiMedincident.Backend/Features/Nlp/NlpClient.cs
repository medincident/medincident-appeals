using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using AiMedincident.Backend.Features.Nlp.Data;
using AiMedincident.Backend.Features.Nlp.Metrics;
using NATS.Client.Core;
using Polly;
using Polly.CircuitBreaker;
using Polly.RateLimiting;
using Polly.Registry;
using Polly.Timeout;

namespace AiMedincident.Backend.Features.Nlp;

public class NlpClient : IAnalyzeClient
{
    public const string AnalyzeSubject = "nlp.analyze";
    public const string ErrorHeader = "Nats-Error";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly INatsConnection _nats;
    private readonly IHostEnvironment _env;
    private readonly ResiliencePipeline<byte[]> _pipeline;
    private readonly AnalyzeMetrics? _metrics;

    public NlpClient(
        INatsConnection nats,
        IHostEnvironment env,
        ResiliencePipelineProvider<string> pipelineProvider,
        AnalyzeMetrics metrics)
    {
        _nats = nats;
        _env = env;
        _pipeline = pipelineProvider.GetPipeline<byte[]>(NlpResiliencePipeline.PipelineKey);
        _metrics = metrics;
    }

    protected NlpClient(INatsConnection nats, IHostEnvironment env)
    {
        _nats = nats;
        _env = env;
        _pipeline = ResiliencePipeline<byte[]>.Empty;
        _metrics = null;
    }

    internal NlpClient(INatsConnection nats, IHostEnvironment env, ResiliencePipeline<byte[]> pipeline)
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
        string outcome;

        byte[] replyBytes;
        try
        {
            replyBytes = await _pipeline.ExecuteAsync(
                async token => await CallNatsAsync(requestBytes, token),
                ct);
            outcome = AnalyzeMetrics.OutcomeSuccess;
        }
        catch (BrokenCircuitException ex)
        {
            outcome = AnalyzeMetrics.OutcomeCircuitOpen;
            _metrics?.RecordRequest(AnalyzeMetrics.ClientNlp, outcome, sw.Elapsed.TotalSeconds);
            throw new NlpCircuitOpenException("nlp-service circuit open", ex);
        }
        catch (RateLimiterRejectedException ex)
        {
            outcome = AnalyzeMetrics.OutcomeBulkheadReject;
            _metrics?.RecordRequest(AnalyzeMetrics.ClientNlp, outcome, sw.Elapsed.TotalSeconds);
            throw new NlpBulkheadRejectedException("nlp-service over capacity", ex);
        }
        catch (TimeoutRejectedException ex)
        {
            outcome = AnalyzeMetrics.OutcomeTimeout;
            _metrics?.RecordRequest(AnalyzeMetrics.ClientNlp, outcome, sw.Elapsed.TotalSeconds);
            throw new NlpTimeoutException("nlp-service timeout", ex);
        }
        catch (NlpException)
        {
            _metrics?.RecordRequest(AnalyzeMetrics.ClientNlp, AnalyzeMetrics.OutcomeError, sw.Elapsed.TotalSeconds);
            throw;
        }

        _metrics?.RecordRequest(AnalyzeMetrics.ClientNlp, outcome, sw.Elapsed.TotalSeconds);

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
