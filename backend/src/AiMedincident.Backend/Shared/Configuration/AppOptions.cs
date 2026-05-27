using System.ComponentModel.DataAnnotations;

namespace AiMedincident.Backend.Shared.Configuration;

public sealed class AppOptions
{
    public const string SectionName = "App";

    [Required]
    public string NatsUrl { get; set; } = "nats://network:4222";

    [Required]
    public string HttpAddr { get; set; } = ":8080";

    [Required, Url]
    public string ZitadelIssuer { get; set; } = "";

    [Range(1, 36500)]
    public int AppealLastsDays { get; set; } = 365;

    [Range(1, 365)]
    public int OutboxRetentionDays { get; set; } = 7;

    [Range(1, 1440)]
    public int AppealsResubmitIntervalMinutes { get; set; } = 5;

    [Range(1, 1440)]
    public int AppealsResubmitStaleMinutes { get; set; } = 2;
}
