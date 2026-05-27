using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiMedincident.Backend.Shared.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameNlpFailureToAnalyzeFailure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TYPE appeal_dlq_failure_type RENAME VALUE 'nlp_failure' TO 'analyze_failure'");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "db_failure,exceeded_max_deliver,invalid_message,nlp_failure,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TYPE appeal_dlq_failure_type RENAME VALUE 'analyze_failure' TO 'nlp_failure'");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:appeal_dlq_failure_type", "db_failure,exceeded_max_deliver,invalid_message,nlp_failure,publish_failure")
                .Annotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved")
                .OldAnnotation("Npgsql:Enum:appeal_dlq_failure_type", "analyze_failure,db_failure,exceeded_max_deliver,invalid_message,publish_failure")
                .OldAnnotation("Npgsql:Enum:appeal_status", "pending,processed,processing,rejected,resolved");
        }
    }
}
