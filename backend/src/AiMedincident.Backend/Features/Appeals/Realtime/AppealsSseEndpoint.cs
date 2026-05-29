using System.Text;
using System.Text.Json;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals.Realtime;

public static class AppealsSseEndpoint
{
    private const string Path = "/sse/appeals";
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(15);

    public static IEndpointRouteBuilder MapAppealsSseEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet(Path, HandleAsync);
        return app;
    }

    private static async Task HandleAsync(
        HttpContext http,
        SseTicketStore tickets,
        INatsJSContext jetStream,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("AppealsSSE");

        var ticket = http.Request.Query["ticket"].ToString();
        if (string.IsNullOrEmpty(ticket) || !tickets.TryConsume(ticket, out var userId))
        {
            http.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        http.Response.StatusCode = StatusCodes.Status200OK;
        http.Response.Headers.ContentType = "text/event-stream";
        http.Response.Headers.CacheControl = "no-cache, no-transform";
        http.Response.Headers["X-Accel-Buffering"] = "no";
        await http.Response.Body.FlushAsync(http.RequestAborted);

        logger.LogInformation("Appeals SSE connected (user={UserId})", userId);

        try
        {
            await PumpAsync(jetStream, http.Response, userId, http.RequestAborted);
        }
        catch (OperationCanceledException) when (http.RequestAborted.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SSE pump failed (user={UserId})", userId);
        }
        finally
        {
            logger.LogInformation("Appeals SSE disconnected (user={UserId})", userId);
        }
    }

    private static async Task PumpAsync(
        INatsJSContext jetStream,
        HttpResponse response,
        string userId,
        CancellationToken ct)
    {
        var consumer = await jetStream.CreateOrderedConsumerAsync(
            AppealsStreamConfig.StreamName,
            new NatsJSOrderedConsumerOpts
            {
                FilterSubjects = [AppealsStreamConfig.ResultSubjectWildcard],
                DeliverPolicy = ConsumerConfigDeliverPolicy.New,
            },
            ct);

        using var keepAliveTimer = new PeriodicTimer(KeepAliveInterval);
        using var pumpLifetime = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var keepAliveTask = SendKeepAlivesAsync(response, keepAliveTimer, pumpLifetime);

        try
        {
            await foreach (var msg in consumer.ConsumeAsync<byte[]>(cancellationToken: pumpLifetime.Token))
            {
                if (msg.Data is null || msg.Data.Length == 0)
                    continue;

                if (!TryFilterByUser(msg.Data, userId, out var kind))
                    continue;

                await WriteEventAsync(response, "appeal." + kind, msg.Data, pumpLifetime.Token);
            }
        }
        finally
        {
            await pumpLifetime.CancelAsync();
            keepAliveTimer.Dispose();
            await keepAliveTask;
        }
    }

    private static bool TryFilterByUser(byte[] payload, string userId, out string kind)
    {
        kind = "result";
        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("user_id", out var u) || u.ValueKind != JsonValueKind.String)
                return false;
            if (!string.Equals(u.GetString(), userId, StringComparison.Ordinal))
                return false;
            // error → appeal.error; status (без error) → appeal.status; иначе appeal.result.
            if (doc.RootElement.TryGetProperty("error", out _))
                kind = "error";
            else if (doc.RootElement.TryGetProperty("status", out _))
                kind = "status";
            else
                kind = "result";
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static async Task WriteEventAsync(
        HttpResponse response,
        string eventName,
        byte[] dataJson,
        CancellationToken ct)
    {
        var header = Encoding.UTF8.GetBytes($"event: {eventName}\ndata: ");
        var footer = "\n\n"u8.ToArray();

        await response.Body.WriteAsync(header.AsMemory(), ct);
        await response.Body.WriteAsync(dataJson.AsMemory(), ct);
        await response.Body.WriteAsync(footer.AsMemory(), ct);
        await response.Body.FlushAsync(ct);
    }

    private static async Task SendKeepAlivesAsync(
        HttpResponse response,
        PeriodicTimer timer,
        CancellationTokenSource lifetime)
    {
        // SSE comment-фрейм: игнорируется клиентом, но пробивает буферизацию прокси.
        var heartbeat = ":\n\n"u8.ToArray();
        try
        {
            while (await timer.WaitForNextTickAsync(lifetime.Token))
            {
                await response.Body.WriteAsync(heartbeat.AsMemory(), lifetime.Token);
                await response.Body.FlushAsync(lifetime.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch
        {
            await lifetime.CancelAsync();
        }
    }
}
