using AiMedincident.Backend.Features.Nlp;
using Polly;
using Polly.CircuitBreaker;
using Polly.RateLimiting;
using Polly.Timeout;
using System.Threading.RateLimiting;

namespace AiMedincident.Backend.UnitTests.Nlp;

public class NlpResiliencePipelineTests
{
    private static ResiliencePipeline<byte[]> BuildPipeline(
        int permitLimit = 2,
        int queueLimit = 0,
        double failureRatio = 0.5,
        int minThroughput = 2,
        int samplingSeconds = 10,
        int breakSeconds = 30,
        int timeoutSeconds = 30)
    {
        return new ResiliencePipelineBuilder<byte[]>()
            .AddRateLimiter(new ConcurrencyLimiter(new ConcurrencyLimiterOptions
            {
                PermitLimit = permitLimit,
                QueueLimit = queueLimit,
            }))
            .AddCircuitBreaker(new CircuitBreakerStrategyOptions<byte[]>
            {
                FailureRatio = failureRatio,
                MinimumThroughput = minThroughput,
                SamplingDuration = TimeSpan.FromSeconds(samplingSeconds),
                BreakDuration = TimeSpan.FromSeconds(breakSeconds),
                ShouldHandle = new PredicateBuilder<byte[]>().Handle<NlpException>(),
            })
            .AddTimeout(TimeSpan.FromSeconds(timeoutSeconds))
            .Build();
    }

    [Fact]
    public async Task Bulkhead_rejects_when_concurrent_calls_exceed_limit()
    {
        var pipeline = BuildPipeline(permitLimit: 1, queueLimit: 0);

        var inFlight = new TaskCompletionSource();
        var release = new TaskCompletionSource();

        // Первый вызов занимает слот и висит
        var firstTask = pipeline.ExecuteAsync(async _ =>
        {
            inFlight.SetResult();
            await release.Task;
            return new byte[] { 1 };
        }, TestContext.Current.CancellationToken).AsTask();

        await inFlight.Task;

        // Второй должен сразу отказать через RateLimiterRejectedException
        var act = async () => await pipeline.ExecuteAsync(
            _ => ValueTask.FromResult(new byte[] { 2 }),
            TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<RateLimiterRejectedException>();

        release.SetResult();
        await firstTask;
    }

    [Fact]
    public async Task CircuitBreaker_opens_after_failure_ratio_exceeded()
    {
        var pipeline = BuildPipeline(
            permitLimit: 10,
            failureRatio: 0.5,
            minThroughput: 4,
            samplingSeconds: 60);

        // 4 запроса подряд с ошибкой = 100% failure при minThroughput=4
        for (var i = 0; i < 4; i++)
        {
            var act = async () => await pipeline.ExecuteAsync<byte[]>(
                _ => throw new NlpException($"boom-{i}"),
                TestContext.Current.CancellationToken);
            await act.Should().ThrowAsync<NlpException>();
        }

        // Следующий вызов должен быть отклонён без захода в callback
        var callbackInvoked = false;
        var failAct = async () => await pipeline.ExecuteAsync(_ =>
        {
            callbackInvoked = true;
            return ValueTask.FromResult(new byte[] { 1 });
        }, TestContext.Current.CancellationToken);

        await failAct.Should().ThrowAsync<BrokenCircuitException>();
        callbackInvoked.Should().BeFalse();
    }

    [Fact]
    public async Task CircuitBreaker_stays_closed_below_minimum_throughput()
    {
        var pipeline = BuildPipeline(failureRatio: 0.5, minThroughput: 10);

        // 3 ошибки — но minThroughput=10, поэтому circuit ещё не открыт
        for (var i = 0; i < 3; i++)
        {
            var fail = async () => await pipeline.ExecuteAsync<byte[]>(
                _ => throw new NlpException($"boom-{i}"),
                TestContext.Current.CancellationToken);
            await fail.Should().ThrowAsync<NlpException>();
        }

        // Успешный вызов должен пройти — circuit Closed
        var result = await pipeline.ExecuteAsync(
            _ => ValueTask.FromResult(new byte[] { 42 }),
            TestContext.Current.CancellationToken);
        result.Should().Equal(new byte[] { 42 });
    }

    [Fact]
    public async Task Timeout_cancels_long_operation()
    {
        var pipeline = BuildPipeline(timeoutSeconds: 1);

        var act = async () => await pipeline.ExecuteAsync<byte[]>(async token =>
        {
            await Task.Delay(TimeSpan.FromSeconds(5), token);
            return new byte[] { 0 };
        }, TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<TimeoutRejectedException>();
    }

    [Fact]
    public async Task SuccessfulCall_returns_response()
    {
        var pipeline = BuildPipeline();

        var result = await pipeline.ExecuteAsync(
            _ => ValueTask.FromResult(new byte[] { 1, 2, 3 }),
            TestContext.Current.CancellationToken);

        result.Should().Equal(new byte[] { 1, 2, 3 });
    }
}
