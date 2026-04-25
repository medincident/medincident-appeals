using System.Text.Json.Serialization;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

[JsonConverter(typeof(JsonStringEnumConverter<AppealStatus>))]
public enum AppealStatus
{
    [JsonStringEnumMemberName("pending")]    Pending,
    [JsonStringEnumMemberName("processing")] Processing,
    [JsonStringEnumMemberName("processed")]  Processed,
    [JsonStringEnumMemberName("resolved")]   Resolved,
    [JsonStringEnumMemberName("rejected")]   Rejected,
}
