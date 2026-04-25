using System.Text.Json;
using AiMedincident.Backend.Features.Appeals.Data;
using NATS.Client.JetStream;

namespace AiMedincident.Backend.Features.Appeals;

public sealed class AppealsConsumer(
    INatsJSContext jetStream,
    IServiceScopeFactory scopeFactory,
    ILogger<AppealsConsumer> logger) : BackgroundService
{
    private static readonly TimeSpan NlpRetryDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan DbRetryDelay = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan PublishRetryDelay = TimeSpan.FromSeconds(2);
    private volatile bool _running;

    public bool IsActive => _running;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await AppealsStreamConfig.EnsureStreamAsync(jetStream, stoppingToken);

        var consumer = await jetStream.CreateOrUpdateConsumerAsync(
            AppealsStreamConfig.StreamName,
            AppealsStreamConfig.BuildConsumerConfig(),
            stoppingToken);

        _running = true;
        logger.LogInformation(
            "Appeals consumer started (stream={Stream}, durable={Durable})",
            AppealsStreamConfig.StreamName,
            AppealsStreamConfig.DurableConsumer);

        try
        {
            await foreach (var msg in consumer.ConsumeAsync<byte[]>(cancellationToken: stoppingToken))
            {
                await HandleAsync(msg, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        finally
        {
            _running = false;
        }
    }

    private async Task HandleAsync(NatsJSMsg<byte[]> msg, CancellationToken ct)
    {
        AppealSubmit? submit;
        try
        {
            submit = msg.Data is null ? null : JsonSerializer.Deserialize<AppealSubmit>(msg.Data);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Invalid JSON in appeals.submit, dropping");
            await msg.AckTerminateAsync(cancellationToken: ct);
            return;
        }

        if (submit is null || string.IsNullOrEmpty(submit.Id) || string.IsNullOrEmpty(submit.Text))
        {
            logger.LogError("Missing id/text in appeals.submit, dropping");
            await msg.AckTerminateAsync(cancellationToken: ct);
            return;
        }

        using var scope = scopeFactory.CreateScope();
        var processor = scope.ServiceProvider.GetRequiredService<AppealsProcessor>();
        var result = await processor.ProcessAsync(submit, ct);

        switch (result)
        {
            case ProcessResult.Success:
                await msg.AckAsync(cancellationToken: ct);
                break;
            case ProcessResult.InvalidMessage:
                await msg.AckTerminateAsync(cancellationToken: ct);
                break;
            case ProcessResult.NlpFailure:
                await msg.NakAsync(delay: NlpRetryDelay, cancellationToken: ct);
                break;
            case ProcessResult.DbFailure:
                await msg.NakAsync(delay: DbRetryDelay, cancellationToken: ct);
                break;
            case ProcessResult.PublishFailure:
                await msg.NakAsync(delay: PublishRetryDelay, cancellationToken: ct);
                break;
        }
    }
}
