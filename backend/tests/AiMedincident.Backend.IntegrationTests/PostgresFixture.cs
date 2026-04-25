using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Shared.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;

namespace AiMedincident.Backend.IntegrationTests;

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("medincident")
        .WithUsername("medincident")
        .WithPassword("medincident")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public AppDbContext CreateDbContext()
    {
        var dataSource = new NpgsqlDataSourceBuilder(ConnectionString)
            .EnableDynamicJson()
            .MapEnum<AppealStatus>("appeal_status")
            .Build();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(dataSource, npg => npg.MapEnum<AppealStatus>("appeal_status"))
            .Options;
        return new AppDbContext(options);
    }

    public ValueTask InitializeAsync() => new(_container.StartAsync());

    public ValueTask DisposeAsync() => _container.DisposeAsync();
}

[CollectionDefinition(nameof(PostgresCollection))]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>;
