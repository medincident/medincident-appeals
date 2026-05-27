using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

public sealed class AppealDlqEntry
{
    public Guid Id { get; set; }
    public string? UserId { get; set; }
    public string Text { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset FailedAt { get; set; }
    public int DeliveryCount { get; set; }
    public string LastError { get; set; } = string.Empty;
    public DlqFailureType FailureType { get; set; }
    public string PayloadJson { get; set; } = "{}";
}

[JsonConverter(typeof(JsonStringEnumConverter<DlqFailureType>))]
public enum DlqFailureType
{
    [JsonStringEnumMemberName("nlp_failure")]      NlpFailure,
    [JsonStringEnumMemberName("db_failure")]       DbFailure,
    [JsonStringEnumMemberName("publish_failure")]  PublishFailure,
    [JsonStringEnumMemberName("invalid_message")]  InvalidMessage,
    [JsonStringEnumMemberName("exceeded_max_deliver")] ExceededMaxDeliver,
}

internal sealed class AppealDlqEntryConfiguration : IEntityTypeConfiguration<AppealDlqEntry>
{
    public void Configure(EntityTypeBuilder<AppealDlqEntry> entity)
    {
        entity.ToTable("appeals_dlq");
        entity.HasKey(a => a.Id);

        entity.Property(a => a.Id).HasColumnName("id");
        entity.Property(a => a.UserId).HasColumnName("user_id");
        entity.Property(a => a.Text).HasColumnName("text");

        entity.Property(a => a.CreatedAt).HasColumnName("created_at");

        entity.Property(a => a.FailedAt)
              .HasColumnName("failed_at")
              .HasDefaultValueSql("NOW()");

        entity.Property(a => a.DeliveryCount).HasColumnName("delivery_count");
        entity.Property(a => a.LastError).HasColumnName("last_error");

        entity.Property(a => a.FailureType)
              .HasColumnName("failure_type")
              .HasColumnType("appeal_dlq_failure_type");

        entity.Property(a => a.PayloadJson)
              .HasColumnName("payload_json")
              .HasColumnType("jsonb");

        entity.HasIndex(a => a.FailedAt)
              .HasDatabaseName("appeals_dlq_failed_at_idx")
              .IsDescending();

        entity.HasIndex(a => a.FailureType)
              .HasDatabaseName("appeals_dlq_failure_type_idx");
    }
}
