using AiMedincident.Backend.Shared.Configuration;
using NATS.Client.Core;
using NATS.Client.Hosting;
using NATS.Client.JetStream;

namespace AiMedincident.Backend.Shared.Nats;

public static class NatsModule
{
    public static IServiceCollection AddNatsMessaging(this IServiceCollection services, AppOptions options)
    {
        services.AddNats(configureOpts: opts => opts with { Url = options.NatsUrl });
        services.AddSingleton<INatsJSContext>(sp =>
            new NatsJSContext(sp.GetRequiredService<INatsConnection>()));
        return services;
    }
}
