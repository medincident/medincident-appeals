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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TYPE appeal_dlq_failure_type RENAME VALUE 'analyze_failure' TO 'nlp_failure'");
        }
    }
}
