using Serilog;
using Serilog.Events;

namespace AiMedincident.Backend.Shared.Logging;

public static class LoggingModule
{
    private const string OutputTemplate =
        "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}";

    public static IHostApplicationBuilder AddLogging(this IHostApplicationBuilder builder)
    {
        var logger = new LoggerConfiguration()
            .ReadFrom.Configuration(builder.Configuration)
            .Enrich.FromLogContext()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Information)
            .WriteTo.Console(outputTemplate: OutputTemplate)
            .CreateLogger();

        builder.Services.AddSerilog(logger, dispose: true);

        return builder;
    }
}
