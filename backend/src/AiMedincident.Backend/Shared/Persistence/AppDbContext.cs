using AiMedincident.Backend.Features.Appeals.Data.Db;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;

namespace AiMedincident.Backend.Shared.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var connString = Environment.GetEnvironmentVariable("ConnectionStrings__AppDb")
            ?? "Host=localhost;Port=5432;Username=medincident;Password=medincident;Database=medincident;SslMode=Disable";

        var dataSource = new NpgsqlDataSourceBuilder(connString)
            .EnableDynamicJson()
            .MapEnum<AppealStatus>("appeal_status")
            .MapEnum<DlqFailureType>("appeal_dlq_failure_type")
            .Build();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(dataSource, o => o
                .MapEnum<AppealStatus>("appeal_status")
                .MapEnum<DlqFailureType>("appeal_dlq_failure_type"))
            .Options;

        return new AppDbContext(options);
    }
}
