using System.Diagnostics.Metrics;
using AiMedincident.Backend.Features.Appeals.Data.Db;

namespace AiMedincident.Backend.Features.Appeals.Metrics;

public sealed class AppealsMetrics : IDisposable
{
    public const string MeterName = "AiMedincident.Backend.Appeals";

    private readonly Meter _meter;
    private readonly Counter<long> _handledTotal;
    private readonly Histogram<double> _handlerDuration;
    private readonly Counter<long> _redeliveryTotal;
    private readonly Counter<long> _dlqWritesTotal;

    public AppealsMetrics(IMeterFactory factory, IServiceScopeFactory scopeFactory)
    {
        _meter = factory.Create(MeterName);

        _handledTotal = _meter.CreateCounter<long>(
            "appeals_consumer_handled_total",
            description: "Сообщения appeals.submit, обработанные consumer'ом, по исходу.");

        _handlerDuration = _meter.CreateHistogram<double>(
            "appeals_handler_duration_seconds",
            unit: "s",
            description: "Длительность обработки одного сообщения appeals.submit.");

        _redeliveryTotal = _meter.CreateCounter<long>(
            "appeals_redelivery_total",
            description: "Сообщения, доставленные повторно (NumDelivered > 1).");

        _dlqWritesTotal = _meter.CreateCounter<long>(
            "appeals_dlq_writes_total",
            description: "Записи в DLQ по типу ошибки.");

        _meter.CreateObservableGauge(
            "appeals_dlq_current",
            () => SampleDlqGauges(scopeFactory),
            description: "Текущее число записей в appeals_dlq по failure_type.");
    }

    public void RecordHandled(string outcome) =>
        _handledTotal.Add(1, new KeyValuePair<string, object?>("outcome", outcome));

    public void RecordDuration(double seconds) =>
        _handlerDuration.Record(seconds);

    public void RecordRedelivery() => _redeliveryTotal.Add(1);

    public void RecordDlqWrite(DlqFailureType type) =>
        _dlqWritesTotal.Add(1, new KeyValuePair<string, object?>("failure_type", type.ToString()));

    private static IEnumerable<Measurement<long>> SampleDlqGauges(IServiceScopeFactory scopeFactory)
    {
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<AppealsDlqRepository>();

        foreach (var type in Enum.GetValues<DlqFailureType>())
        {
            var count = repo.CountByTypeAsync(type, CancellationToken.None).GetAwaiter().GetResult();
            yield return new Measurement<long>(
                count,
                new KeyValuePair<string, object?>("failure_type", type.ToString()));
        }
    }

    public void Dispose() => _meter.Dispose();
}
