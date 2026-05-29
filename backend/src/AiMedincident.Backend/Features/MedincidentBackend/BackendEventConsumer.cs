using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Configuration;
using Event.Incident.Buffer.V1;
using Event.Incident.V1;
using Event.V1;
using Microsoft.Extensions.Options;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.MedincidentBackend;

// Отслеживает статус наших обращений по событиям medincident-backend без поллинга:
// корреляция по buffer_id (храним на Appeal после submit) и source_buffer_id в
// incident.created. Обновление статуса в репозитории пушится на фронт через SSE.
public sealed class BackendEventConsumer(
    IServiceScopeFactory scopeFactory,
    IOptions<AppOptions> options,
    ILogger<BackendEventConsumer> logger) : BackgroundService
{
    private const string BufferSubjects = "medincident.event.patient_incident_buffer.v1.>";
    private const string IncidentSubjects = "medincident.event.incident.v1.>";

    private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opts = options.Value.Medincident;
        if (!opts.Enabled || string.IsNullOrEmpty(opts.NatsUrl))
        {
            logger.LogInformation("Backend event consumer disabled (Medincident.Enabled={Enabled})", opts.Enabled);
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunAsync(opts, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Backend event consumer error — reconnecting in {Delay}s", ReconnectDelay.TotalSeconds);
                await Task.Delay(ReconnectDelay, stoppingToken);
            }
        }
    }

    private async Task RunAsync(MedincidentOptions opts, CancellationToken ct)
    {
        await using var nc = new NatsConnection(new NatsOpts { Url = opts.NatsUrl, Name = "ai-medincident-backend-events" });
        var js = new NatsJSContext(nc);

        // Durable consumer на чужом stream, фильтрованный на buffer- и incident-события.
        var consumer = await js.CreateOrUpdateConsumerAsync(
            opts.EventsStream,
            new ConsumerConfig(opts.EventsConsumer)
            {
                FilterSubjects = [BufferSubjects, IncidentSubjects],
                AckPolicy = ConsumerConfigAckPolicy.Explicit,
                DeliverPolicy = ConsumerConfigDeliverPolicy.New,
            },
            ct);

        logger.LogInformation(
            "Backend event consumer started (stream={Stream}, durable={Durable}, nats={Nats})",
            opts.EventsStream, opts.EventsConsumer, opts.NatsUrl);

        await foreach (var msg in consumer.ConsumeAsync<byte[]>(cancellationToken: ct))
        {
            try
            {
                await HandleAsync(msg.Data, ct);
                await msg.AckAsync(cancellationToken: ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to handle backend event on {Subject}", msg.Subject);
                await msg.AckAsync(cancellationToken: ct); // не зацикливаемся на битом событии
            }
        }
    }

    private async Task HandleAsync(byte[]? data, CancellationToken ct)
    {
        if (data is null || data.Length == 0)
            return;

        var env = Envelope.Parser.ParseFrom(data);
        var payload = env.Payload;

        if (payload.Is(PatientIncidentBufferUpdated.Descriptor))
        {
            var ev = payload.Unpack<PatientIncidentBufferUpdated>();
            await ApplyByBufferAsync(ev.BufferId, BackendStatusMapper.FromBufferStatus(ev.Status), ct);
        }
        else if (payload.Is(IncidentCreated.Descriptor))
        {
            var ev = payload.Unpack<IncidentCreated>();
            // Сохраняем incidentId, чтобы дальше ловить терминал по status_changed.
            // source_buffer_id (StringValue) разворачивается в nullable string.
            var sourceBuffer = ev.SourceBufferId;
            if (!string.IsNullOrEmpty(sourceBuffer))
                await ApplyIncidentCreatedAsync(sourceBuffer, ev.IncidentId, BackendStatusMapper.FromIncidentStatus(ev.Status), ct);
        }
        else if (payload.Is(IncidentStatusChanged.Descriptor))
        {
            var ev = payload.Unpack<IncidentStatusChanged>();
            await ApplyByIncidentAsync(ev.IncidentId, BackendStatusMapper.FromIncidentStatus(ev.NewStatus), ct);
        }
        // прочие события (created буфера, priority/description) игнорируем.
    }

    private async Task ApplyByBufferAsync(string bufferIdRaw, AppealStatus? status, CancellationToken ct)
    {
        if (status is null || !Guid.TryParse(bufferIdRaw, out var bufferId))
            return;
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<AppealsRepository>();
        var updated = await repo.SetStatusByBufferAsync(bufferId, status.Value, ct);
        if (updated is not null)
            logger.LogInformation("Appeal {AppealId} status via buffer {BufferId} -> {Status}", updated.Id, bufferId, status);
    }

    private async Task ApplyIncidentCreatedAsync(string bufferIdRaw, string incidentIdRaw, AppealStatus? status, CancellationToken ct)
    {
        if (status is null || !Guid.TryParse(bufferIdRaw, out var bufferId) || !Guid.TryParse(incidentIdRaw, out var incidentId))
            return;
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<AppealsRepository>();
        var updated = await repo.SetIncidentByBufferAsync(bufferId, incidentId, status.Value, ct);
        if (updated is not null)
            logger.LogInformation("Appeal {AppealId} linked to incident {IncidentId} -> {Status}", updated.Id, incidentId, status);
    }

    private async Task ApplyByIncidentAsync(string incidentIdRaw, AppealStatus? status, CancellationToken ct)
    {
        if (status is null || !Guid.TryParse(incidentIdRaw, out var incidentId))
            return;
        using var scope = scopeFactory.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<AppealsRepository>();
        var updated = await repo.SetStatusByIncidentAsync(incidentId, status.Value, ct);
        if (updated is not null)
            logger.LogInformation("Appeal {AppealId} status via incident {IncidentId} -> {Status}", updated.Id, incidentId, status);
    }
}
