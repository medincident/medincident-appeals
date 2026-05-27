using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Options;

namespace AiMedincident.Backend.Features.Retention;

public sealed class AppealRetentionService(
    IServiceScopeFactory scopeFactory,
    IOptions<AppOptions> options,
    ILogger<AppealRetentionService> logger) : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            await SweepAsync(stoppingToken);

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var appealsRepo = scope.ServiceProvider.GetRequiredService<AppealsRepository>();
            var outboxRepo = scope.ServiceProvider.GetRequiredService<OutboxRepository>();

            var appealsCutoff = DateTimeOffset.UtcNow.AddDays(-options.Value.AppealLastsDays);
            var deletedAppeals = await appealsRepo.DeleteOlderThanAsync(appealsCutoff, ct);

            var outboxCutoff = DateTimeOffset.UtcNow.AddDays(-options.Value.OutboxRetentionDays);
            var deletedOutbox = await outboxRepo.DeletePublishedOlderThanAsync(outboxCutoff, ct);

            logger.LogInformation(
                "retention sweep: appeals(cutoff={AppealsCutoff:O}, deleted={DeletedAppeals}), outbox(cutoff={OutboxCutoff:O}, deleted={DeletedOutbox})",
                appealsCutoff, deletedAppeals, outboxCutoff, deletedOutbox);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "retention sweep failed");
        }
    }
}

public static class RetentionModule
{
    public static IServiceCollection AddAppealRetention(this IServiceCollection services)
    {
        services.AddHostedService<AppealRetentionService>();
        return services;
    }
}
