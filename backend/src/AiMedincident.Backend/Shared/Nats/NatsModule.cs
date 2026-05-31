using AiMedincident.Backend.Shared.Configuration;
using NATS.Client.Core;
using NATS.Client.Hosting;
using NATS.Client.JetStream;

namespace AiMedincident.Backend.Shared.Nats;

public static class NatsModule
{
    public static IServiceCollection AddNatsMessaging(this IServiceCollection services, AppOptions options)
    {
        // RequestTimeout по умолчанию в NATS.NET — 5с, что меньше времени анализа
        // NLP на длинных текстах (seq2seq ~5с+). Иначе RequestAsync падает с
        // NatsNoReplyException ещё до ответа NLP. Поднимаем до NLP-таймаута, чтобы
        // лимит держал Polly-pipeline (Nlp.TimeoutSeconds), а не транспорт.
        var requestTimeout = TimeSpan.FromSeconds(options.Nlp.TimeoutSeconds);
        services.AddNats(configureOpts: opts => opts with
        {
            Url = options.NatsUrl,
            RequestTimeout = requestTimeout,
        });
        services.AddSingleton<INatsJSContext>(sp =>
            new NatsJSContext(sp.GetRequiredService<INatsConnection>()));
        return services;
    }
}
