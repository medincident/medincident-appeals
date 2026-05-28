using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiMedincident.Backend.Shared.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAppealStatusFailed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "failed,pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "failed,pending,processed,processing,rejected,resolved");
        }
    }
}
