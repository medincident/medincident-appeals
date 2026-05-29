using AiMedincident.Backend.Features.MedincidentBackend;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.UnitTests.MedincidentBackend;

public class SubmitMappingTests
{
    [Fact]
    public void Description_uses_formalized_text_when_present()
    {
        var nlp = new NlpAnalyzeResponse { FormalizedText = "formalized" };
        SubmitMapping.Description(nlp, "original").Should().Be("formalized");
    }

    [Fact]
    public void Description_falls_back_to_original_when_no_formalized()
    {
        SubmitMapping.Description(new NlpAnalyzeResponse { FormalizedText = "" }, "original")
            .Should().Be("original");
        SubmitMapping.Description(null, "original").Should().Be("original");
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
