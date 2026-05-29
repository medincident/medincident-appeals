using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiMedincident.Backend.Shared.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBackendSubmissionTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "accepted,cancelled,closed,failed,pending,processed,processing,rejected,resolved,submitted")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "failed,pending,processed,processing,rejected,resolved");

            migrationBuilder.AddColumn<Guid>(
                name: "buffer_id",
                table: "appeals",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "incident_id",
                table: "appeals",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "buffer_id",
                table: "appeals");

            migrationBuilder.DropColumn(
                name: "incident_id",
                table: "appeals");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "failed,pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "accepted,cancelled,closed,failed,pending,processed,processing,rejected,resolved,submitted");
        }
    }
}
