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
            var days = options.Value.AppealLastsDays;
            var cutoff = DateTimeOffset.UtcNow.AddDays(-days);

            using var scope = scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<AppealsRepository>();
            var deleted = await repo.DeleteOlderThanAsync(cutoff, ct);

            logger.LogInformation(
                "appeal retention sweep: cutoff={Cutoff:O}, deleted={Deleted}",
                cutoff, deleted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "appeal retention sweep failed");
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
