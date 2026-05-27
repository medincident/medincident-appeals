using System.Diagnostics.Metrics;

namespace AiMedincident.Backend.Features.Nlp.Metrics;

public sealed class AnalyzeMetrics : IDisposable
{
    public const string MeterName = "AiMedincident.Backend.Analyze";

    public const string ClientNlp = "nlp";
    public const string ClientLlm = "llm";

    public const string OutcomeSuccess = "success";
    public const string OutcomeBulkheadReject = "bulkhead_reject";
    public const string OutcomeCircuitOpen = "circuit_open";
    public const string OutcomeTimeout = "timeout";
    public const string OutcomeError = "error";

    public const int CircuitClosed = 0;
    public const int CircuitHalfOpen = 1;
    public const int CircuitOpen = 2;

    private readonly Meter _meter;
    private readonly Counter<long> _requests;
    private readonly Histogram<double> _duration;
    private readonly Counter<long> _fallbackTotal;

    private int _nlpCircuitState = CircuitClosed;

    public AnalyzeMetrics(IMeterFactory factory)
    {
        _meter = factory.Create(MeterName);

        _requests = _meter.CreateCounter<long>(
            "analyze_requests_total",
            description: "Analyze requests by client (nlp/llm) and outcome.");

        _duration = _meter.CreateHistogram<double>(
            "analyze_duration_seconds",
            unit: "s",
            description: "Analyze request duration by client.");

        _fallbackTotal = _meter.CreateCounter<long>(
            "analyze_fallback_total",
            description: "Triggers of LLM fallback after NLP failure.");

        _meter.CreateObservableGauge(
            "nlp_circuit_state",
            () => _nlpCircuitState,
            description: "NLP circuit breaker state: 0=closed, 1=half-open, 2=open.");
    }

    public void RecordRequest(string client, string outcome, double seconds)
    {
        _requests.Add(1,
            new KeyValuePair<string, object?>("client", client),
            new KeyValuePair<string, object?>("outcome", outcome));
        _duration.Record(seconds, new KeyValuePair<string, object?>("client", client));
    }

    public void RecordFallback() => _fallbackTotal.Add(1);

    public void SetNlpCircuitState(int state) => _nlpCircuitState = state;

    public void Dispose() => _meter.Dispose();
}
