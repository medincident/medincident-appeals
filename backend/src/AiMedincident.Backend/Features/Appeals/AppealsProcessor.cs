using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Nlp;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.Features.Appeals;

public class AppealsProcessor(
    NlpClient nlp,
    AppealsRepository repository,
    AppealResultPublisher publisher,
    ILogger<AppealsProcessor> logger)
{
    public static readonly TimeSpan DbSaveTimeout = TimeSpan.FromSeconds(5);

    public virtual async Task<ProcessResult> ProcessAsync(AppealSubmit submit, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(submit.Id) || string.IsNullOrWhiteSpace(submit.Text))
            return new ProcessResult.InvalidMessage("missing id/text");

        if (!Guid.TryParse(submit.Id, out var appealId))
            return new ProcessResult.InvalidMessage("id is not a UUID");

        var hasUser = !string.IsNullOrEmpty(submit.UserId);

        if (hasUser)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(DbSaveTimeout);
                await repository.EnqueueAsync(
                    appealId, submit.UserId!, submit.Text,
                    AppealRowBuilder.ParseCreatedAt(submit.CreatedAt),
                    cts.Token);
                await repository.SetStatusAsync(appealId, AppealStatus.Processing, cts.Token);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Postgres enqueue failed, will retry (id={Id})", submit.Id);
                return new ProcessResult.DbFailure(ex.Message);
            }
        }
        else
        {
            logger.LogWarning("Appeal without user_id — not persisting (id={Id})", submit.Id);
        }

        NlpAnalyzeResponse nlpResult;
        try
        {
            nlpResult = await nlp.AnalyzeAsync(submit.Text, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "NLP call failed (id={Id})", submit.Id);
            await publisher.PublishErrorAsync(submit.Id, ex.Message, ct);
            return new ProcessResult.NlpFailure(ex.Message);
        }

        if (hasUser)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(DbSaveTimeout);
                var row = AppealRowBuilder.Build(submit, nlpResult);
                await repository.UpsertAsync(row, cts.Token);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Postgres save failed, will retry (id={Id})", submit.Id);
                return new ProcessResult.DbFailure(ex.Message);
            }
        }

        try
        {
            await publisher.PublishSuccessAsync(submit.Id, nlpResult, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Publish result failed, will retry (id={Id})", submit.Id);
            return new ProcessResult.PublishFailure(ex.Message);
        }

        logger.LogInformation(
            "Appeal processed (id={Id}, is_important={IsImportant}, category={Category})",
            submit.Id,
            nlpResult.IsImportant,
            nlpResult.Category?.GetValueOrDefault("name"));

        return new ProcessResult.Success();
    }
}
