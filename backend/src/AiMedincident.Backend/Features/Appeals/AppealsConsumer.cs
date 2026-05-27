using System.Diagnostics;
using System.Text.Json;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Appeals.Metrics;
using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Options;
using NATS.Client.JetStream;

namespace AiMedincident.Backend.Features.Appeals;

public sealed class AppealsConsumer(
    INatsJSContext jetStream,
    IServiceScopeFactory scopeFactory,
    AppealsMetrics metrics,
    IOptions<AppOptions> options,
    ILogger<AppealsConsumer> logger) : BackgroundService
{
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan GracefulDrainTimeout = TimeSpan.FromSeconds(60);

    private volatile bool _running;

    public bool IsActive => _running;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await AppealsStreamConfig.EnsureStreamAsync(jetStream, stoppingToken);

        var consumer = await jetStream.CreateOrUpdateConsumerAsync(
            AppealsStreamConfig.StreamName,
            AppealsStreamConfig.BuildConsumerConfig(),
            stoppingToken);

        var maxConcurrent = options.Value.AppealsMaxConcurrentHandlers;
        using var slots = new SemaphoreSlim(maxConcurrent, maxConcurrent);

        _running = true;
        logger.LogInformation(
            "Appeals consumer started (stream={Stream}, durable={Durable}, maxConcurrent={Max})",
            AppealsStreamConfig.StreamName,
            AppealsStreamConfig.DurableConsumer,
            maxConcurrent);

        try
        {
            await foreach (var msg in consumer.ConsumeAsync<byte[]>(cancellationToken: stoppingToken))
            {
                await slots.WaitAsync(stoppingToken);
                _ = HandleInBackgroundAsync(msg, slots, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        finally
        {
            _running = false;
            await DrainAsync(slots, maxConcurrent);
        }
    }

    private async Task HandleInBackgroundAsync(NatsJSMsg<byte[]> msg, SemaphoreSlim slots, CancellationToken ct)
    {
        try
        {
            await HandleAsync(msg, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled error in HandleAsync");
        }
        finally
        {
            slots.Release();
        }
    }

    private async Task DrainAsync(SemaphoreSlim slots, int maxConcurrent)
    {
        using var drainCts = new CancellationTokenSource(GracefulDrainTimeout);
        try
        {
            for (var i = 0; i < maxConcurrent; i++)
                await slots.WaitAsync(drainCts.Token);
            logger.LogInformation("Appeals consumer drained gracefully");
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning(
                "Appeals consumer drain timed out after {Seconds}s — in-flight handlers will be redelivered via AckWait",
                GracefulDrainTimeout.TotalSeconds);
        }
    }

    private async Task HandleAsync(NatsJSMsg<byte[]> msg, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var deliveryCount = (int)(msg.Metadata?.NumDelivered ?? 1);
        if (deliveryCount > 1) metrics.RecordRedelivery();

        AppealSubmit? submit;
        try
        {
            submit = msg.Data is null ? null : JsonSerializer.Deserialize<AppealSubmit>(msg.Data);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Invalid JSON in appeals.submit, dropping");
            await TryWriteDlqRawAsync(msg.Data, DlqFailureType.InvalidMessage, $"invalid json: {ex.Message}", deliveryCount, ct);
            await msg.AckTerminateAsync(cancellationToken: ct);
            metrics.RecordHandled("invalid_message");
            metrics.RecordDuration(sw.Elapsed.TotalSeconds);
            return;
        }

        if (submit is null || string.IsNullOrEmpty(submit.Id) || string.IsNullOrEmpty(submit.Text))
        {
            logger.LogError("Missing id/text in appeals.submit, dropping");
            await TryWriteDlqRawAsync(msg.Data, DlqFailureType.InvalidMessage, "missing id/text", deliveryCount, ct);
            await msg.AckTerminateAsync(cancellationToken: ct);
            metrics.RecordHandled("invalid_message");
            metrics.RecordDuration(sw.Elapsed.TotalSeconds);
            return;
        }

        using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var heartbeatTask = RunHeartbeatAsync(msg, heartbeatCts.Token);

        ProcessResult result;
        try
        {
            using var scope = scopeFactory.CreateScope();
            var processor = scope.ServiceProvider.GetRequiredService<AppealsProcessor>();
            result = await processor.ProcessAsync(submit, ct);
        }
        finally
        {
            await heartbeatCts.CancelAsync();
            await heartbeatTask;
        }

        switch (result)
        {
            case ProcessResult.Success:
                await msg.AckAsync(cancellationToken: ct);
                metrics.RecordHandled("success");
                metrics.RecordDuration(sw.Elapsed.TotalSeconds);
                return;

            case ProcessResult.InvalidMessage inv:
                await TryWriteDlqAsync(submit, DlqFailureType.InvalidMessage, inv.Reason, deliveryCount, ct);
                await msg.AckTerminateAsync(cancellationToken: ct);
                metrics.RecordHandled("invalid_message");
                metrics.RecordDuration(sw.Elapsed.TotalSeconds);
                return;

            case ProcessResult.Failure failure:
                var failureType = failure switch
                {
                    ProcessResult.AppealAnalyzeFailure => DlqFailureType.AnalyzeFailure,
                    ProcessResult.DbFailure => DlqFailureType.DbFailure,
                    ProcessResult.PublishFailure => DlqFailureType.PublishFailure,
                    _ => DlqFailureType.AnalyzeFailure,
                };

                if (deliveryCount >= AppealsStreamConfig.MaxDeliver)
                {
                    await TryWriteDlqAsync(submit, DlqFailureType.ExceededMaxDeliver, failure.Reason, deliveryCount, ct);
                    await msg.AckTerminateAsync(cancellationToken: ct);
                    logger.LogWarning(
                        "Appeal moved to DLQ after {Count} deliveries (id={Id}, type={Type}, reason={Reason})",
                        deliveryCount, submit.Id, failureType, failure.Reason);
                    metrics.RecordHandled("exceeded_max_deliver");
                    metrics.RecordDuration(sw.Elapsed.TotalSeconds);
                    return;
                }

                var delay = ComputeBackoff(deliveryCount);
                logger.LogInformation(
                    "Appeal nak (id={Id}, attempt={Attempt}/{Max}, delay={Delay}s, reason={Reason})",
                    submit.Id, deliveryCount, AppealsStreamConfig.MaxDeliver, delay.TotalSeconds, failure.Reason);
                await msg.NakAsync(delay: delay, cancellationToken: ct);
                metrics.RecordHandled(failureType.ToString());
                metrics.RecordDuration(sw.Elapsed.TotalSeconds);
                return;
        }
    }

    public static TimeSpan ComputeBackoff(int deliveryCount, Random? rng = null)
    {
        if (deliveryCount < 1) deliveryCount = 1;
        var baseSeconds = Math.Min(180.0, 2.0 * Math.Pow(2, deliveryCount - 1));
        var jitter = 1.0 + ((rng ?? Random.Shared).NextDouble() * 0.6 - 0.3);
        return TimeSpan.FromSeconds(baseSeconds * jitter);
    }

    private async Task RunHeartbeatAsync(NatsJSMsg<byte[]> msg, CancellationToken ct)
    {
        try
        {
            using var timer = new PeriodicTimer(HeartbeatInterval);
            while (await timer.WaitForNextTickAsync(ct))
            {
                await msg.AckProgressAsync(cancellationToken: ct);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "heartbeat failed");
        }
    }

    private async Task TryWriteDlqAsync(
        AppealSubmit submit,
        DlqFailureType failureType,
        string reason,
        int deliveryCount,
        CancellationToken ct)
    {
        if (!Guid.TryParse(submit.Id, out var id))
            return;

        try
        {
            using var scope = scopeFactory.CreateScope();
            var dlq = scope.ServiceProvider.GetRequiredService<AppealsDlqRepository>();

            var entry = new AppealDlqEntry
            {
                Id = id,
                UserId = submit.UserId,
                Text = submit.Text,
                CreatedAt = AppealRowBuilder.ParseCreatedAt(submit.CreatedAt),
                FailedAt = DateTimeOffset.UtcNow,
                DeliveryCount = deliveryCount,
                LastError = Truncate(reason, 2000),
                FailureType = failureType,
                PayloadJson = JsonSerializer.Serialize(submit),
            };

            await dlq.UpsertAsync(entry, ct);
            metrics.RecordDlqWrite(failureType);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to write DLQ entry (id={Id})", submit.Id);
        }
    }

    private async Task TryWriteDlqRawAsync(
        byte[]? rawData,
        DlqFailureType failureType,
        string reason,
        int deliveryCount,
        CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var dlq = scope.ServiceProvider.GetRequiredService<AppealsDlqRepository>();

            var raw = rawData is null ? "" : System.Text.Encoding.UTF8.GetString(rawData);
            var entry = new AppealDlqEntry
            {
                Id = Guid.NewGuid(),
                UserId = null,
                Text = Truncate(raw, 16 * 1024),
                CreatedAt = DateTimeOffset.UtcNow,
                FailedAt = DateTimeOffset.UtcNow,
                DeliveryCount = deliveryCount,
                LastError = Truncate(reason, 2000),
                FailureType = failureType,
                PayloadJson = "null",
            };

            await dlq.UpsertAsync(entry, ct);
            metrics.RecordDlqWrite(failureType);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to write raw DLQ entry");
        }
    }

    private static string Truncate(string? value, int maxLength) =>
        string.IsNullOrEmpty(value) || value.Length <= maxLength ? value ?? "" : value[..maxLength];
}
