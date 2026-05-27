using System.Text;
using System.Text.Json;
using AiMedincident.Backend.Features.Auth;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals.Realtime;

public static class AppealsSseEndpoint
{
    private const string Path = "/sse/appeals";
    private static readonly TimeSpan RevalidateInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(15);

    public static IEndpointRouteBuilder MapAppealsSseEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet(Path, HandleAsync);
        return app;
    }

    private static async Task HandleAsync(
        HttpContext http,
        IAuthService auth,
        INatsJSContext jetStream,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("AppealsSSE");

        var token = http.Request.Query["access_token"].ToString();
        if (string.IsNullOrEmpty(token))
        {
            http.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var initial = await auth.VerifiedSubjectAsync("Bearer " + token, http.RequestAborted);
        if (initial is not AuthResult.Success success)
        {
            http.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var userId = success.Subject;

        http.Response.StatusCode = StatusCodes.Status200OK;
        http.Response.Headers.ContentType = "text/event-stream";
        http.Response.Headers.CacheControl = "no-cache, no-transform";
        http.Response.Headers["X-Accel-Buffering"] = "no";
        await http.Response.Body.FlushAsync(http.RequestAborted);

        logger.LogInformation("Appeals SSE connected (user={UserId})", userId);

        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted);
        var revalidateTask = RevalidateSessionLoopAsync(auth, token, lifetime, logger);

        try
        {
            await PumpAsync(jetStream, http.Response, userId, lifetime);
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SSE pump failed (user={UserId})", userId);
        }
        finally
        {
            await lifetime.CancelAsync();
            await revalidateTask;
            logger.LogInformation("Appeals SSE disconnected (user={UserId})", userId);
        }
    }

    private static async Task PumpAsync(
        INatsJSContext jetStream,
        HttpResponse response,
        string userId,
        CancellationTokenSource lifetime)
    {
        var consumer = await jetStream.CreateOrderedConsumerAsync(
            AppealsStreamConfig.StreamName,
            new NatsJSOrderedConsumerOpts
            {
                FilterSubjects = [AppealsStreamConfig.ResultSubjectWildcard],
                DeliverPolicy = ConsumerConfigDeliverPolicy.New,
            },
            lifetime.Token);

        using var keepAliveTimer = new PeriodicTimer(KeepAliveInterval);
        var keepAliveTask = SendKeepAlivesAsync(response, keepAliveTimer, lifetime);

        try
        {
            await foreach (var msg in consumer.ConsumeAsync<byte[]>(cancellationToken: lifetime.Token))
            {
                if (msg.Data is null || msg.Data.Length == 0)
                    continue;

                if (!TryFilterByUser(msg.Data, userId, out var kind))
                    continue;

                await WriteEventAsync(response, "appeal." + kind, msg.Data, lifetime.Token);
            }
        }
        finally
        {
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
            kind = doc.RootElement.TryGetProperty("error", out _) ? "error" : "result";
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

    private static async Task RevalidateSessionLoopAsync(
        IAuthService auth,
        string token,
        CancellationTokenSource lifetime,
        ILogger logger)
    {
        try
        {
            using var timer = new PeriodicTimer(RevalidateInterval);
            while (await timer.WaitForNextTickAsync(lifetime.Token))
            {
                auth.RemoveToken(token);
                var result = await auth.VerifiedSubjectAsync("Bearer " + token, lifetime.Token);
                if (result is AuthResult.Success) continue;

                logger.LogInformation(
                    "Appeals SSE revalidation failed: {Reason}",
                    result is AuthResult.Failure f ? f.Reason : "unknown");
                await lifetime.CancelAsync();
                return;
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SSE revalidation loop crashed");
            await lifetime.CancelAsync();
        }
    }
}
