using AiMedincident.Backend.Shared.Configuration;
using Microsoft.Extensions.Caching.Memory;

namespace AiMedincident.Backend.Features.Auth;

public static class AuthModule
{
    public static IServiceCollection AddZitadelAuth(this IServiceCollection services, AppOptions options)
    {
        services.AddMemoryCache(static o => o.SizeLimit = ZitadelAuthService.MaxCacheEntries);

        services.AddHttpClient(ZitadelAuthService.HttpClientName,
                static c => c.Timeout = TimeSpan.FromSeconds(5))
            .AddStandardResilienceHandler();

        services.AddSingleton<IAuthService>(sp => new ZitadelAuthService(
            sp.GetRequiredService<IHttpClientFactory>(),
            sp.GetRequiredService<IMemoryCache>(),
            options.ZitadelIssuer));

        return services;
    }
}
