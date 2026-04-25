using AiMedincident.Backend.Features.Appeals;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiMedincident.Backend.IntegrationTests.Persistence;

[Collection(nameof(PostgresCollection))]
public sealed class AppealsRepositoryIntegrationTests(PostgresFixture fixture) : IAsyncLifetime
{
    private AppDbContext _db = null!;
    private AppealsRepository _repo = null!;

    public async ValueTask InitializeAsync()
    {
        _db = fixture.CreateDbContext();
        await DatabaseInitialization.EnsureSchemaAsync(_db, attempts: 3, delay: TimeSpan.FromMilliseconds(500));
        await _db.Database.ExecuteSqlRawAsync("TRUNCATE appeals");
        _repo = new AppealsRepository(_db);
    }

    public ValueTask DisposeAsync() => _db.DisposeAsync();

    private static Appeal NewAppeal(string text = "text", string userId = "u1", string? categoryId = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Text = text,
        Summary = text,
        FormalizedText = text,
        IsImportant = true,
        ImportantConfidence = 0.5f,
        Reason = "reason",
        Theses = new List<string> { "a", "b" },
        CategoryId = categoryId,
        Status = AppealStatus.Processed,
        CreatedAt = DateTimeOffset.UtcNow,
    };

    [Fact]
    public async Task Upsert_persists_jsonb_theses()
    {
        var a = NewAppeal();
        a.Theses = new List<string> { "первый", "второй" };

        await _repo.UpsertAsync(a);

        var raw = await _db.Database
            .SqlQueryRaw<string>("SELECT theses::text AS \"Value\" FROM appeals WHERE id = {0}", a.Id)
            .SingleAsync();
        raw.Should().Contain("первый").And.Contain("второй");
    }

    [Fact]
    public async Task Upsert_replaces_mutable_fields_on_conflict()
    {
        var a = NewAppeal();
        await _repo.UpsertAsync(a);

        var updated = new Appeal
        {
            Id = a.Id,
            UserId = "ignored-on-update",
            Text = "ignored-on-update",
            Summary = "summary-2",
            FormalizedText = "formalized-2",
            IsImportant = false,
            ImportantConfidence = 0.1f,
            Reason = "reason-2",
            Theses = new List<string> { "new" },
            CategoryId = "cat",
            CategoryName = "Cat",
            Status = AppealStatus.Processed,
            CreatedAt = a.CreatedAt.AddMinutes(10),
        };
        await _repo.UpsertAsync(updated);

        var saved = await _db.Set<Appeal>().AsNoTracking().SingleAsync(x => x.Id == a.Id);
        saved.UserId.Should().Be("u1");
        saved.Text.Should().Be("text");
        saved.Summary.Should().Be("summary-2");
        saved.IsImportant.Should().BeFalse();
        saved.Theses.Should().Equal("new");
    }

    [Fact]
    public async Task List_case_insensitive_search_matches_ilike()
    {
        var english = NewAppeal(text: "Patient is suffering from COUGH");
        var russian = NewAppeal(text: "У пациента сильная ГОЛОВНАЯ БОЛЬ");
        await _repo.UpsertAsync(english);
        await _repo.UpsertAsync(russian);

        var results = await _repo.ListAsync(new ListFilter("u1", "cough", null, null, 0));

        results.Should().HaveCount(1);
        results[0].Id.Should().Be(english.Id);
    }

    [Fact]
    public async Task List_respects_index_ordering_by_created_at_desc()
    {
        var oldAppeal = NewAppeal();
        oldAppeal.CreatedAt = DateTimeOffset.UtcNow.AddHours(-1);
        var newAppeal = NewAppeal();
        newAppeal.CreatedAt = DateTimeOffset.UtcNow;
        await _repo.UpsertAsync(oldAppeal);
        await _repo.UpsertAsync(newAppeal);

        var results = await _repo.ListAsync(new ListFilter("u1", null, null, null, 0));

        results.Select(r => r.Id).Should().Equal(newAppeal.Id, oldAppeal.Id);
    }

    [Fact]
    public async Task List_throws_when_user_id_missing()
    {
        var call = () => _repo.ListAsync(new ListFilter("", null, null, null, 0));

        await call.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task List_filters_by_category_id()
    {
        await _repo.UpsertAsync(NewAppeal(categoryId: "c1"));
        await _repo.UpsertAsync(NewAppeal(categoryId: "c2"));

        var results = await _repo.ListAsync(new ListFilter("u1", null, "c1", null, 0));

        results.Should().HaveCount(1);
        results[0].CategoryId.Should().Be("c1");
    }

    [Fact]
    public async Task List_clamps_invalid_limit_to_default()
    {
        for (var i = 0; i < 3; i++) await _repo.UpsertAsync(NewAppeal());

        var results = await _repo.ListAsync(new ListFilter("u1", null, null, null, -1));

        results.Should().HaveCount(3);
    }
}
