using System.Diagnostics.Metrics;
using AiMedincident.Backend.Features.Appeals.Data.Db;

namespace AiMedincident.Backend.Features.Appeals.Metrics;

public sealed class OutboxMetrics : IDisposable
{
    public const string MeterName = "AiMedincident.Backend.Outbox";

    private readonly Meter _meter;
    private readonly Counter<long> _publishTotal;
    private readonly Histogram<double> _publishDuration;

    public OutboxMetrics(IMeterFactory factory, IServiceScopeFactory scopeFactory)
    {
        _meter = factory.Create(MeterName);

        _publishTotal = _meter.CreateCounter<long>(
            "outbox_publish_total",
            description: "Outbox publish attempts by outcome.");

        _publishDuration = _meter.CreateHistogram<double>(
            "outbox_publish_duration_seconds",
            unit: "s",
            description: "Outbox single-event publish duration.");

        _meter.CreateObservableGauge(
            "outbox_unpublished_current",
            () => SampleUnpublished(scopeFactory),
            description: "Unpublished outbox entries.");

        _meter.CreateObservableGauge(
            "outbox_stuck_current",
            () => SampleStuck(scopeFactory),
            description: "Outbox entries with attempts >= MaxAttempts.");
    }

    public void RecordPublish(string outcome, double seconds)
    {
        _publishTotal.Add(1, new KeyValuePair<string, object?>("outcome", outcome));
        _publishDuration.Record(seconds);
    }

    private static long SampleUnpublished(IServiceScopeFactory scopeFactory)
    {
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<OutboxRepository>();
        return repo.CountUnpublishedAsync(CancellationToken.None).GetAwaiter().GetResult();
    }

    private static long SampleStuck(IServiceScopeFactory scopeFactory)
    {
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<OutboxRepository>();
        return repo.CountStuckAsync(CancellationToken.None).GetAwaiter().GetResult();
    }

    public void Dispose() => _meter.Dispose();
}
