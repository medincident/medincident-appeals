using System;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace AiMedincident.Backend.Shared.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved");

            migrationBuilder.CreateTable(
                name: "appeals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    text = table.Column<string>(type: "text", nullable: false),
                    summary = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    formalized_text = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    is_important = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    important_confidence = table.Column<float>(type: "real", nullable: true),
                    reason = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    theses = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb"),
                    category_id = table.Column<string>(type: "text", nullable: true),
                    category_name = table.Column<string>(type: "text", nullable: true),
                    subcategory_id = table.Column<string>(type: "text", nullable: true),
                    subcategory_name = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<AppealStatus>(type: "appeal_status", nullable: false, defaultValue: AppealStatus.Pending),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_appeals", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "audit_log",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    action = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    appeal_id = table.Column<Guid>(type: "uuid", nullable: true),
                    ip = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_log", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "appeals_user_category_idx",
                table: "appeals",
                columns: new[] { "user_id", "category_id" });

            migrationBuilder.CreateIndex(
                name: "appeals_user_created_idx",
                table: "appeals",
                columns: new[] { "user_id", "created_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "audit_user_created_idx",
                table: "audit_log",
                columns: new[] { "user_id", "created_at" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "appeals");

            migrationBuilder.DropTable(
                name: "audit_log");
        }
    }
}
