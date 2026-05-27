using System.Diagnostics.Metrics;
using AiMedincident.Backend.Features.Llm;
using AiMedincident.Backend.Features.Nlp;
using AiMedincident.Backend.Features.Nlp.Data;
using AiMedincident.Backend.Features.Nlp.Metrics;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiMedincident.Backend.UnitTests.Nlp;

public class FallbackAnalyzeClientTests
{
    private static AnalyzeMetrics TestMetrics() => new(new TestMeterFactory());

    private sealed class TestMeterFactory : IMeterFactory
    {
        public Meter Create(MeterOptions options) => new(options);
        public void Dispose() { }
    }
    [Fact]
    public async Task Primary_success_returns_primary_response()
    {
        var primary = new FakeNlp { Response = new NlpAnalyzeResponse { IsImportant = true, FormalizedText = "nlp" } };
        var secondary = new FakeLlm();
        var fallback = new FallbackAnalyzeClient(primary, secondary, TestMetrics(), NullLogger<FallbackAnalyzeClient>.Instance);

        var result = await fallback.AnalyzeAsync("text", TestContext.Current.CancellationToken);

        result.FormalizedText.Should().Be("nlp");
        primary.CallCount.Should().Be(1);
        secondary.CallCount.Should().Be(0);
    }

    [Fact]
    public async Task Primary_throws_NlpException_calls_secondary()
    {
        var primary = new FakeNlp { Exception = new NlpException("nlp down") };
        var secondary = new FakeLlm { Response = new NlpAnalyzeResponse { IsImportant = true, FormalizedText = "llm" } };
        var fallback = new FallbackAnalyzeClient(primary, secondary, TestMetrics(), NullLogger<FallbackAnalyzeClient>.Instance);

        var result = await fallback.AnalyzeAsync("text", TestContext.Current.CancellationToken);

        result.FormalizedText.Should().Be("llm");
        primary.CallCount.Should().Be(1);
        secondary.CallCount.Should().Be(1);
    }

    [Fact]
    public async Task Both_fail_throws_aggregate()
    {
        var primary = new FakeNlp { Exception = new NlpException("nlp down") };
        var secondary = new FakeLlm { Exception = new LlmException("llm down") };
        var fallback = new FallbackAnalyzeClient(primary, secondary, TestMetrics(), NullLogger<FallbackAnalyzeClient>.Instance);

        var act = async () => await fallback.AnalyzeAsync("text", TestContext.Current.CancellationToken);

        var ex = (await act.Should().ThrowAsync<AggregateAnalyzeException>()).Which;
        ex.Primary.Message.Should().Be("nlp down");
        ex.Secondary.Message.Should().Be("llm down");
        ex.Message.Should().Contain("nlp down").And.Contain("llm down");
    }

    [Fact]
    public async Task Non_NlpException_from_primary_does_not_trigger_fallback()
    {
        var primary = new FakeNlp { Exception = new InvalidOperationException("unexpected") };
        var secondary = new FakeLlm();
        var fallback = new FallbackAnalyzeClient(primary, secondary, TestMetrics(), NullLogger<FallbackAnalyzeClient>.Instance);

        var act = async () => await fallback.AnalyzeAsync("text", TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<InvalidOperationException>();
        secondary.CallCount.Should().Be(0);
    }

    private sealed class FakeEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed class FakeNlp : NlpClient
    {
        public NlpAnalyzeResponse Response { get; set; } = new();
        public Exception? Exception { get; set; }
        public int CallCount { get; private set; }

        public FakeNlp() : base(null!, new FakeEnv()) { }

        public override Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
        {
            CallCount++;
            return Exception is null ? Task.FromResult(Response) : Task.FromException<NlpAnalyzeResponse>(Exception);
        }
    }

    private sealed class FakeLlm : LlmClient
    {
        public NlpAnalyzeResponse Response { get; set; } = new();
        public Exception? Exception { get; set; }
        public int CallCount { get; private set; }

        public FakeLlm() : base(null!, new FakeEnv()) { }

        public override Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
        {
            CallCount++;
            return Exception is null ? Task.FromResult(Response) : Task.FromException<NlpAnalyzeResponse>(Exception);
        }
    }
}
