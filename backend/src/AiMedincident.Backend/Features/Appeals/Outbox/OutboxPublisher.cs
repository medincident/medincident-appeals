using System.Diagnostics;
using System.Text;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Appeals.Metrics;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals.Outbox;

public sealed class OutboxPublisher(
    IServiceScopeFactory scopeFactory,
    INatsJSContext jetStream,
    OutboxMetrics metrics,
    ILogger<OutboxPublisher> logger) : BackgroundService
{
    private static readonly TimeSpan IdlePollInterval = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan RetryBackoffBase = TimeSpan.FromSeconds(5);
    private const int BatchSize = 50;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Outbox publisher started");

        while (!stoppingToken.IsCancellationRequested)
        {
            int processed;
            try
            {
                processed = await PublishBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Outbox batch failed");
                processed = 0;
            }

            if (processed == 0)
            {
                try { await Task.Delay(IdlePollInterval, stoppingToken); }
                catch (OperationCanceledException) { return; }
            }
        }
    }

    private async Task<int> PublishBatchAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<OutboxRepository>();

        var batch = await repo.LockBatchForPublishAsync(BatchSize, RetryBackoffBase, ct);
        if (batch.Count == 0) return 0;

        foreach (var entry in batch)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                await jetStream.PublishAsync(
                    entry.Subject,
                    Encoding.UTF8.GetBytes(entry.PayloadJson),
                    opts: new NatsJSPubOpts { MsgId = entry.MsgId },
                    cancellationToken: ct);

                await repo.MarkPublishedAsync(entry.Id, ct);
                metrics.RecordPublish("success", sw.Elapsed.TotalSeconds);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(
                    ex,
                    "Outbox publish failed (id={Id}, aggregate={Aggregate}, attempts={Attempts})",
                    entry.Id, entry.AggregateId, entry.Attempts);
                await repo.MarkFailedAsync(entry.Id, Truncate(ex.Message, 2000), ct);
                metrics.RecordPublish("failure", sw.Elapsed.TotalSeconds);
            }
        }

        return batch.Count;
    }

    private static string Truncate(string? value, int maxLength) =>
        string.IsNullOrEmpty(value) || value.Length <= maxLength ? value ?? "" : value[..maxLength];
}
