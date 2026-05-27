using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

public sealed class OutboxEntry
{
    public Guid Id { get; set; }
    public Guid AggregateId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string MsgId { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset? LastAttemptAt { get; set; }
}

internal sealed class OutboxEntryConfiguration : IEntityTypeConfiguration<OutboxEntry>
{
    public void Configure(EntityTypeBuilder<OutboxEntry> entity)
    {
        entity.ToTable("outbox");
        entity.HasKey(e => e.Id);

        entity.Property(e => e.Id).HasColumnName("id");
        entity.Property(e => e.AggregateId).HasColumnName("aggregate_id");
        entity.Property(e => e.Subject).HasColumnName("subject");
        entity.Property(e => e.MsgId).HasColumnName("msg_id");

        entity.Property(e => e.PayloadJson)
              .HasColumnName("payload_json")
              .HasColumnType("jsonb");

        entity.Property(e => e.CreatedAt)
              .HasColumnName("created_at")
              .HasDefaultValueSql("NOW()");

        entity.Property(e => e.PublishedAt).HasColumnName("published_at");
        entity.Property(e => e.Attempts).HasColumnName("attempts");
        entity.Property(e => e.LastError).HasColumnName("last_error");
        entity.Property(e => e.LastAttemptAt).HasColumnName("last_attempt_at");

        entity.HasIndex(e => e.CreatedAt)
              .HasDatabaseName("outbox_unpublished_idx")
              .HasFilter("\"published_at\" IS NULL");

        entity.HasIndex(e => e.AggregateId)
              .HasDatabaseName("outbox_aggregate_idx");

        entity.HasIndex(e => e.PublishedAt)
              .HasDatabaseName("outbox_published_at_idx")
              .HasFilter("\"published_at\" IS NOT NULL");
    }
}
