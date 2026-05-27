using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Options;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals;

public sealed class AppealsResubmitService(
    IServiceScopeFactory scopeFactory,
    INatsJSContext jetStream,
    IOptions<AppOptions> options,
    ILogger<AppealsResubmitService> logger) : BackgroundService
{
    private const int BatchSize = 200;

    private readonly TimeSpan _interval = TimeSpan.FromMinutes(options.Value.AppealsResubmitIntervalMinutes);
    private readonly TimeSpan _stale = TimeSpan.FromMinutes(options.Value.AppealsResubmitStaleMinutes);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await AppealsStreamConfig.EnsureStreamAsync(jetStream, stoppingToken);

            // initial sweep on startup — re-publish everything still unprocessed
            await SweepAsync(olderThan: null, stoppingToken);

            using var timer = new PeriodicTimer(_interval);
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var threshold = DateTimeOffset.UtcNow - _stale;
                await SweepAsync(threshold, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task SweepAsync(DateTimeOffset? olderThan, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<AppealsRepository>();

        IReadOnlyList<Appeal> appeals;
        try
        {
            appeals = await repo.ListUnprocessedAsync(olderThan, BatchSize, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "failed to list unprocessed appeals");
            return;
        }

        if (appeals.Count == 0) return;

        logger.LogInformation("Resubmitting {Count} unprocessed appeal(s)", appeals.Count);

        foreach (var appeal in appeals)
        {
            var submit = new AppealSubmit(
                Id: appeal.Id.ToString(),
                Text: appeal.Text,
                UserId: appeal.UserId,
                CreatedAt: appeal.CreatedAt.ToString("O"));

            try
            {
                await jetStream.PublishAsync(
                    AppealsStreamConfig.SubmitSubject,
                    submit,
                    opts: new NatsJSPubOpts { MsgId = appeal.Id.ToString() },
                    cancellationToken: ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "failed to resubmit appeal {Id}", appeal.Id);
            }
        }
    }
}
