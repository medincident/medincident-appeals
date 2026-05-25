using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiMedincident.Backend.Features.Appeals.Data.Db;

public sealed class Appeal
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string FormalizedText { get; set; } = string.Empty;
    public bool IsImportant { get; set; } = true;
    public float? ImportantConfidence { get; set; }
    public string? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? SubcategoryId { get; set; }
    public string? SubcategoryName { get; set; }
    public AppealStatus Status { get; set; } = AppealStatus.Pending;
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class AppealConfiguration : IEntityTypeConfiguration<Appeal>
{
    public void Configure(EntityTypeBuilder<Appeal> entity)
    {
        entity.ToTable("appeals");
        entity.HasKey(a => a.Id);

        entity.Property(a => a.Id).HasColumnName("id");
        entity.Property(a => a.UserId).HasColumnName("user_id");
        entity.Property(a => a.Text).HasColumnName("text");

        entity.Property(a => a.FormalizedText)
              .HasColumnName("formalized_text")
              .HasDefaultValue("");

        entity.Property(a => a.IsImportant)
              .HasColumnName("is_important")
              .HasDefaultValue(true);

        entity.Property(a => a.ImportantConfidence)
              .HasColumnName("important_confidence");

        entity.Property(a => a.CategoryId).HasColumnName("category_id");
        entity.Property(a => a.CategoryName).HasColumnName("category_name");
        entity.Property(a => a.SubcategoryId).HasColumnName("subcategory_id");
        entity.Property(a => a.SubcategoryName).HasColumnName("subcategory_name");

        entity.Property(a => a.Status)
              .HasColumnName("status")
              .HasColumnType("appeal_status")
              .HasDefaultValue(AppealStatus.Pending);

        entity.Property(a => a.CreatedAt)
              .HasColumnName("created_at")
              .HasDefaultValueSql("NOW()");

        entity.HasIndex(a => new { a.UserId, a.CreatedAt })
              .HasDatabaseName("appeals_user_created_idx")
              .IsDescending(false, true);

        entity.HasIndex(a => new { a.UserId, a.CategoryId })
              .HasDatabaseName("appeals_user_category_idx");
    }
}
