using AiMedincident.Backend.Features.Appeals;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Nlp;
using AiMedincident.Backend.Features.Nlp.Data;
using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace AiMedincident.Backend.IntegrationTests.Appeals;

internal sealed class FakeEnv : IHostEnvironment
{
    public string EnvironmentName { get; set; } = Environments.Production;
    public string ApplicationName { get; set; } = "tests";
    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
    public IFileProvider ContentRootFileProvider { get; set; } = null!;
}

[Collection(nameof(PostgresCollection))]
public sealed class AppealsProcessorIntegrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    private AppDbContext _db = null!;
    private AppealsRepository _repo = null!;
    private FakeNlpClient _nlp = null!;
    private RecordingPublisher _publisher = null!;
    private AppealsProcessor _processor = null!;

    public async ValueTask InitializeAsync()
    {
        _db = fixture.CreateDbContext();
        await DatabaseInitialization.EnsureSchemaAsync(_db, attempts: 3, delay: TimeSpan.FromMilliseconds(500));
        await _db.Database.ExecuteSqlRawAsync("TRUNCATE appeals");
        _repo = new AppealsRepository(_db);
        _nlp = new FakeNlpClient();
        _publisher = new RecordingPublisher();
        _processor = new AppealsProcessor(_nlp, _repo, _publisher, NullLogger<AppealsProcessor>.Instance);
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();

    private static AppealSubmit ValidSubmit(string? userId = "user-1") =>
        new(Guid.NewGuid().ToString(), "hello", userId, null);

    [Fact]
    public async Task Returns_invalid_when_id_missing()
    {
        var result = await _processor.ProcessAsync(new AppealSubmit(string.Empty, "text", "u", null), TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.InvalidMessage>();
        _nlp.CallCount.Should().Be(0);
    }

    [Fact]
    public async Task Returns_invalid_when_id_not_uuid()
    {
        var result = await _processor.ProcessAsync(new AppealSubmit("not-a-uuid", "text", "u", null), TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.InvalidMessage>();
    }

    [Fact]
    public async Task Returns_invalid_when_text_empty()
    {
        var result = await _processor.ProcessAsync(new AppealSubmit(Guid.NewGuid().ToString(), "", "u", null), TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.InvalidMessage>();
    }

    [Fact]
    public async Task Returns_nlp_failure_and_publishes_error_when_nlp_throws()
    {
        _nlp.Exception = new NlpException("503");
        var submit = ValidSubmit();

        var result = await _processor.ProcessAsync(submit, TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.NlpFailure>();
        _publisher.Errors.Should().ContainSingle().Which.Should().Be((submit.Id, "503"));
        _publisher.Successes.Should().BeEmpty();
    }

    [Fact]
    public async Task Returns_db_failure_when_repository_throws()
    {
        _nlp.Response = new NlpAnalyzeResponse();
        var submit = new AppealSubmit(Guid.NewGuid().ToString(), "t", UserId: "u", CreatedAt: "not-a-date");
        await _db.DisposeAsync();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Username=x;Password=x;Database=x;Timeout=1")
            .Options);
        _repo = new AppealsRepository(_db);
        _processor = new AppealsProcessor(_nlp, _repo, _publisher, NullLogger<AppealsProcessor>.Instance);

        var result = await _processor.ProcessAsync(submit, TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.DbFailure>();
        _publisher.Successes.Should().BeEmpty();
    }

    [Fact]
    public async Task Skips_db_save_when_user_id_missing()
    {
        _nlp.Response = new NlpAnalyzeResponse();
        var submit = ValidSubmit(userId: null);

        var result = await _processor.ProcessAsync(submit, TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.Success>();
        (await _db.Set<Appeal>().CountAsync(TestContext.Current.CancellationToken)).Should().Be(0);
        _publisher.Successes.Should().ContainSingle().Which.id.Should().Be(submit.Id);
    }

    [Fact]
    public async Task Returns_publish_failure_when_success_publish_throws()
    {
        _nlp.Response = new NlpAnalyzeResponse();
        _publisher.ThrowOnSuccess = new InvalidOperationException("nats down");
        var submit = ValidSubmit();

        var result = await _processor.ProcessAsync(submit, TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.PublishFailure>();
    }

    [Fact]
    public async Task Success_path_saves_row_and_publishes()
    {
        _nlp.Response = new NlpAnalyzeResponse { IsImportant = true, FormalizedText = "f" };
        var submit = ValidSubmit();

        var result = await _processor.ProcessAsync(submit, TestContext.Current.CancellationToken);

        result.Should().BeOfType<ProcessResult.Success>();
        var saved = await _db.Set<Appeal>().SingleAsync(a => a.Id == Guid.Parse(submit.Id), TestContext.Current.CancellationToken);
        saved.FormalizedText.Should().Be("f");
        _publisher.Successes.Should().ContainSingle().Which.id.Should().Be(submit.Id);
    }

    private sealed class FakeNlpClient : NlpClient
    {
        public NlpAnalyzeResponse Response { get; set; } = new();
        public Exception? Exception { get; set; }
        public int CallCount { get; private set; }

        public FakeNlpClient() : base(null!, new FakeEnv()) { }

        public override Task<NlpAnalyzeResponse> AnalyzeAsync(string text, CancellationToken ct = default)
        {
            CallCount++;
            return Exception is null ? Task.FromResult(Response) : Task.FromException<NlpAnalyzeResponse>(Exception);
        }
    }

    private sealed class RecordingPublisher : AppealResultPublisher
    {
        public List<(string id, NlpAnalyzeResponse result)> Successes { get; } = [];
        public List<(string id, string error)> Errors { get; } = [];
        public Exception? ThrowOnSuccess { get; set; }

        public RecordingPublisher() : base(null!, null!) { }

        public override Task PublishSuccessAsync(string appealId, NlpAnalyzeResponse result, CancellationToken ct = default)
        {
            if (ThrowOnSuccess is not null) return Task.FromException(ThrowOnSuccess);
            Successes.Add((appealId, result));
            return Task.CompletedTask;
        }

        public override Task PublishErrorAsync(string appealId, string error, CancellationToken ct = default)
        {
            Errors.Add((appealId, error));
            return Task.CompletedTask;
        }
    }
}
