using AiMedincident.Backend.Features.Appeals;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.UnitTests.Appeals;

public class AppealRowBuilderTests
{
    private static readonly string ValidId = Guid.NewGuid().ToString();

    [Fact]
    public void Build_maps_required_fields()
    {
        var submit = new AppealSubmit(ValidId, "hello world", "user-1", "2026-01-01T10:00:00Z");
        var nlp = new NlpAnalyzeResponse
        {
            IsImportant = true,
            ImportantConfidence = 0.75,
            Reason = "reason",
            FormalizedText = "Hello, World.",
            Theses = new[] { "t1" },
            Category = new Dictionary<string, string> { ["id"] = "c1", ["name"] = "Cat" },
            Subcategory = new Dictionary<string, string> { ["id"] = "s1", ["name"] = "Sub" },
        };

        var row = AppealRowBuilder.Build(submit, nlp);

        row.Id.Should().Be(Guid.Parse(ValidId));
        row.UserId.Should().Be("user-1");
        row.Text.Should().Be("hello world");
        row.FormalizedText.Should().Be("Hello, World.");
        row.IsImportant.Should().BeTrue();
        row.ImportantConfidence.Should().BeApproximately(0.75f, 1e-4f);
        row.Reason.Should().Be("reason");
        row.Theses.Should().Equal("t1");
        row.CategoryId.Should().Be("c1");
        row.CategoryName.Should().Be("Cat");
        row.SubcategoryId.Should().Be("s1");
        row.SubcategoryName.Should().Be("Sub");
        row.Status.Should().Be(AppealStatus.Processed);
        row.CreatedAt.Should().Be(DateTimeOffset.Parse("2026-01-01T10:00:00Z"));
    }

    [Fact]
    public void Build_leaves_confidence_null_when_zero()
    {
        var submit = new AppealSubmit(ValidId, "text", "u", null);
        var nlp = new NlpAnalyzeResponse { ImportantConfidence = 0 };

        var row = AppealRowBuilder.Build(submit, nlp);

        row.ImportantConfidence.Should().BeNull();
    }

    [Fact]
    public void Build_treats_empty_category_fields_as_null()
    {
        var submit = new AppealSubmit(ValidId, "text", "u", null);
        var nlp = new NlpAnalyzeResponse
        {
            Category = new Dictionary<string, string> { ["id"] = string.Empty },
        };

        var row = AppealRowBuilder.Build(submit, nlp);

        row.CategoryId.Should().BeNull();
        row.CategoryName.Should().BeNull();
    }

    [Fact]
    public void Build_defaults_theses_to_empty_list()
    {
        var submit = new AppealSubmit(ValidId, "text", "u", null);
        var nlp = new NlpAnalyzeResponse { Theses = null };

        var row = AppealRowBuilder.Build(submit, nlp);

        row.Theses.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void MakeSummary_returns_input_when_within_limit()
    {
        var s = AppealRowBuilder.MakeSummary("hello   world", 50);

        s.Should().Be("hello world");
    }

    [Fact]
    public void MakeSummary_truncates_with_ellipsis()
    {
        var s = AppealRowBuilder.MakeSummary(new string('a', 120), 50);

        s.Length.Should().Be(50);
        s.EndsWith('…').Should().BeTrue();
    }

    [Fact]
    public void ParseCreatedAt_returns_default_for_empty_input()
    {
        AppealRowBuilder.ParseCreatedAt(null).Should().Be(default);
        AppealRowBuilder.ParseCreatedAt("").Should().Be(default);
        AppealRowBuilder.ParseCreatedAt("not-a-date").Should().Be(default);
    }
}
