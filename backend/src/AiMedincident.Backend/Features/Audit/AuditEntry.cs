using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiMedincident.Backend.Features.Audit;

public sealed class AuditEntry
{
    public long Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public Guid? AppealId { get; set; }
    public string? Ip { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class AuditEntryConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    public void Configure(EntityTypeBuilder<AuditEntry> entity)
    {
        entity.ToTable("audit_log");
        entity.HasKey(a => a.Id);
        entity.Property(a => a.Id).HasColumnName("id").UseIdentityByDefaultColumn();
        entity.Property(a => a.UserId).HasColumnName("user_id").IsRequired();
        entity.Property(a => a.Action).HasColumnName("action").IsRequired().HasMaxLength(64);
        entity.Property(a => a.AppealId).HasColumnName("appeal_id");
        entity.Property(a => a.Ip).HasColumnName("ip").HasMaxLength(64);
        entity.Property(a => a.CreatedAt)
              .HasColumnName("created_at")
              .HasDefaultValueSql("NOW()");

        entity.HasIndex(a => new { a.UserId, a.CreatedAt })
              .HasDatabaseName("audit_user_created_idx")
              .IsDescending(false, true);
    }
}
