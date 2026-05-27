using System;
using AiMedincident.Backend.Features.Appeals.Data.Db;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiMedincident.Backend.Shared.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAppealsDlq : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "db_failure,exceeded_max_deliver,invalid_message,nlp_failure,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved");

            migrationBuilder.CreateTable(
                name: "appeals_dlq",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: true),
                    text = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    failed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    delivery_count = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "text", nullable: false),
                    failure_type = table.Column<DlqFailureType>(type: "appeal_dlq_failure_type", nullable: false),
                    payload_json = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_appeals_dlq", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "appeals_dlq_failed_at_idx",
                table: "appeals_dlq",
                column: "failed_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "appeals_dlq_failure_type_idx",
                table: "appeals_dlq",
                column: "failure_type");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "appeals_dlq");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "db_failure,exceeded_max_deliver,invalid_message,nlp_failure,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved");
        }
    }
}
