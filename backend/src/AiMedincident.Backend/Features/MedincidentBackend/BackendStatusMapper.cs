using AiMedincident.Backend.Features.Appeals.Data.Db;

namespace AiMedincident.Backend.Features.MedincidentBackend;

// Строковые статусы buffer/incident из событий medincident-backend → AppealStatus.
public static class BackendStatusMapper
{
    public static AppealStatus? FromBufferStatus(string? status) => Normalize(status) switch
    {
        "pending" => AppealStatus.Submitted,
        "published" => AppealStatus.Accepted,
        "rejected" => AppealStatus.Closed,
        "cancelled" or "canceled" => AppealStatus.Cancelled,
        _ => null,
    };

    public static AppealStatus? FromIncidentStatus(string? status) => Normalize(status) switch
    {
        "pending" or "in_progress" => AppealStatus.Accepted,
        "done" or "rejected" => AppealStatus.Closed,
        "cancelled" or "canceled" => AppealStatus.Cancelled,
        _ => null,
    };

    // Терпит и "published", и enum-форму "BUFFER_STATUS_PUBLISHED".
    private static string Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return "";
        var s = raw.Trim().ToLowerInvariant();
        foreach (var prefix in new[] { "buffer_status_", "incident_status_", "patient_status_" })
        {
            if (s.StartsWith(prefix, StringComparison.Ordinal))
                return s[prefix.Length..];
        }
        return s;
    }
}
