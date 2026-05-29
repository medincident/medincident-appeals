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

    [Range(1, 100)]
    public int AppealsMaxConcurrentHandlers { get; set; } = 5;

    public NlpResilienceOptions Nlp { get; set; } = new();

    public LlmResilienceOptions Llm { get; set; } = new();

    public MedincidentOptions Medincident { get; set; } = new();
}

public sealed class MedincidentOptions
{
    // Включает submit обращений и подписку на статус-события medincident-backend.
    public bool Enabled { get; set; }

    public string ServerUrl { get; set; } = "";

    // UUID организации в medincident-backend (НЕ Zitadel orgId).
    public string OrgId { get; set; } = "";

    // Отдельная NATS-шина medincident-backend (не наша).
    public string NatsUrl { get; set; } = "";

    public string EventsStream { get; set; } = "medincident_events";
    public string EventsConsumer { get; set; } = "ai-medincident-appeals";
}

public sealed class NlpResilienceOptions
{
    [Range(1, 100)]
    public int MaxConcurrency { get; set; } = 10;

    [Range(0, 1000)]
    public int QueueLimit { get; set; } = 20;

    [Range(1, 600)]
    public int TimeoutSeconds { get; set; } = 30;

    [Range(0.0, 1.0)]
    public double CircuitFailureRatio { get; set; } = 0.5;

    [Range(1, 1000)]
    public int CircuitMinThroughput { get; set; } = 5;

    [Range(1, 600)]
    public int CircuitSamplingSeconds { get; set; } = 30;

    [Range(1, 600)]
    public int CircuitBreakSeconds { get; set; } = 30;
}

public sealed class LlmResilienceOptions
{
    [Range(1, 20)]
    public int MaxConcurrency { get; set; } = 1;

    [Range(0, 100)]
    public int QueueLimit { get; set; } = 5;

    [Range(10, 600)]
    public int TimeoutSeconds { get; set; } = 120;
}
