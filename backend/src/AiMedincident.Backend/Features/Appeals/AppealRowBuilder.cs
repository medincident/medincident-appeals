using System.Globalization;
using AiMedincident.Backend.Features.Appeals.Data;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.Nlp.Data;

namespace AiMedincident.Backend.Features.Appeals;

public static class AppealRowBuilder
{
    public const int SummaryMaxChars = 50;

    public static Appeal Build(AppealSubmit submit, NlpAnalyzeResponse nlp)
    {
        var row = new Appeal
        {
            Id = Guid.Parse(submit.Id),
            UserId = submit.UserId ?? string.Empty,
            Text = submit.Text,
            Summary = MakeSummary(submit.Text, SummaryMaxChars),
            FormalizedText = nlp.FormalizedText ?? string.Empty,
            IsImportant = nlp.IsImportant,
            ImportantConfidence = nlp.ImportantConfidence != 0d
                ? (float?)nlp.ImportantConfidence
                : null,
            Reason = nlp.Reason ?? string.Empty,
            Theses = nlp.Theses?.ToList() ?? [],
            Status = AppealStatus.Processed,
            CreatedAt = ParseCreatedAt(submit.CreatedAt),
        };

        if (nlp.Category is { Count: > 0 })
        {
            row.CategoryId = ValueOrNull(nlp.Category, "id");
            row.CategoryName = ValueOrNull(nlp.Category, "name");
        }
        if (nlp.Subcategory is { Count: > 0 })
        {
            row.SubcategoryId = ValueOrNull(nlp.Subcategory, "id");
            row.SubcategoryName = ValueOrNull(nlp.Subcategory, "name");
        }

        return row;
    }

    internal static DateTimeOffset ParseCreatedAt(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return default;
        return DateTimeOffset.TryParse(
            raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var ts)
            ? ts
            : default;
    }

    internal static string MakeSummary(string text, int max)
    {
        var collapsed = string.Join(' ', text.Split(
            (char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var enumerator = StringInfo.GetTextElementEnumerator(collapsed);
        var elements = new List<string>();
        while (enumerator.MoveNext())
            elements.Add((string)enumerator.Current);

        if (elements.Count <= max) return collapsed;
        return string.Concat(elements.Take(max - 1)) + "…";
    }

    private static string? ValueOrNull(IReadOnlyDictionary<string, string> dict, string key) =>
        dict.TryGetValue(key, out var value) && !string.IsNullOrEmpty(value) ? value : null;
}
