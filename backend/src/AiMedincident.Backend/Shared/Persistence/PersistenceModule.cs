using AiMedincident.Backend.Features.Appeals.Data.Db;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AiMedincident.Backend.Shared.Persistence;

public static class PersistenceModule
{
    public static IServiceCollection AddAppDatabase(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("AppDb")
            ?? throw new InvalidOperationException("ConnectionStrings:AppDb is required");

        services.AddNpgsqlDataSource(connectionString, static b => b
            .EnableDynamicJson()
            .MapEnum<AppealStatus>("appeal_status"));

        services.AddDbContext<AppDbContext>(static (sp, o) =>
            o.UseNpgsql(sp.GetRequiredService<NpgsqlDataSource>(), npg => npg.MapEnum<AppealStatus>("appeal_status")));

        return services;
    }
}
