using AiMedincident.Backend.Features.MedincidentBackend;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.UnitTests.MedincidentBackend;

public class SubmitMappingTests
{
    [Fact]
    public void Description_is_patient_original_text()
    {
        // По контракту gateway description = исходный текст пациента, НЕ формализация.
        SubmitMapping.Description("original patient text").Should().Be("original patient text");
    }

    [Fact]
    public void Summary_uses_formalized_text_else_falls_back_to_original()
    {
        var nlp = new NlpAnalyzeResponse { FormalizedText = "formalized" };
        SubmitMapping.Summary(nlp, "original").Should().Be("formalized");
        SubmitMapping.Summary(new NlpAnalyzeResponse { FormalizedText = "" }, "original")
            .Should().Be("original");
        SubmitMapping.Summary(null, "original").Should().Be("original");
    }

    [Fact]
    public void OccurredAt_formats_valid_date_and_nulls_invalid()
    {
        SubmitMapping.OccurredAt("2026-05-31T09:48:46.1234567+00:00").Should().NotBeNull();
        SubmitMapping.OccurredAt(null).Should().BeNull();
        SubmitMapping.OccurredAt("").Should().BeNull();
        SubmitMapping.OccurredAt("not-a-date").Should().BeNull();
    }

    [Fact]
    public void Priority_high_when_important_else_normal()
    {
        SubmitMapping.Priority(new NlpAnalyzeResponse { IsImportant = true }).Should().Be("BUFFER_PRIORITY_HIGH");
        SubmitMapping.Priority(new NlpAnalyzeResponse { IsImportant = false }).Should().Be("BUFFER_PRIORITY_NORMAL");
        SubmitMapping.Priority(null).Should().Be("BUFFER_PRIORITY_NORMAL");
    }

    [Fact]
    public void Category_and_type_ids_extracted_from_dicts()
    {
        var nlp = new NlpAnalyzeResponse
        {
            Category = new Dictionary<string, string> { ["id"] = "cat-1", ["name"] = "C" },
            Subcategory = new Dictionary<string, string> { ["id"] = "type-1", ["name"] = "T" },
        };
        SubmitMapping.CategoryId(nlp).Should().Be("cat-1");
        SubmitMapping.TypeId(nlp).Should().Be("type-1"); // подкатегория AI = тип backend
    }

    [Fact]
    public void Null_category_subcategory_yield_null()
    {
        SubmitMapping.CategoryId(new NlpAnalyzeResponse()).Should().BeNull();
        SubmitMapping.TypeId(new NlpAnalyzeResponse()).Should().BeNull();
        SubmitMapping.CategoryId(null).Should().BeNull();
    }
}
