using AiMedincident.Backend.Features.Appeals;
using AiMedincident.Backend.Features.Audit;
using AiMedincident.Backend.Features.Auth;
using AiMedincident.Backend.Features.Health;
using AiMedincident.Backend.Features.Nlp;
using AiMedincident.Backend.Features.Retention;
using AiMedincident.Backend.Shared.Configuration;
using AiMedincident.Backend.Shared.Logging;
using AiMedincident.Backend.Shared.Nats;
using AiMedincident.Backend.Shared.Persistence;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.AddLogging();

builder.Services
    .AddOptions<AppOptions>()
    .Bind(builder.Configuration.GetSection(AppOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

var appOptions = builder.Configuration
    .GetSection(AppOptions.SectionName)
    .Get<AppOptions>() ?? new AppOptions();

builder.Services
    .AddProblemDetails()
    .AddAppHealthChecks()
    .AddAppDatabase(builder.Configuration)
    .AddNatsMessaging(appOptions)
    .AddZitadelAuth(appOptions)
    .AddNlp()
    .AddAudit()
    .AddAppealRetention()
    .AddAppeals();

var appUrl = appOptions.HttpAddr.StartsWith(':')
    ? $"http://0.0.0.0{appOptions.HttpAddr}"
    : appOptions.HttpAddr;
builder.WebHost.UseUrls(appUrl);

var app = builder.Build();

app.UseSerilogRequestLogging(opts =>
{
    opts.GetLevel = static (_, _, _) => Serilog.Events.LogEventLevel.Information;
    if (!app.Environment.IsDevelopment())
    {
        opts.IncludeQueryInRequestPath = false;
    }
});
app.UseExceptionHandler();
app.UseStatusCodePages();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DatabaseInitialization.EnsureSchemaAsync(db, app.Logger, app.Lifetime.ApplicationStopping);
}

app.MapHealthChecks("/health");

var api = app.MapGroup("/api/v1");
api.MapAppealsEndpoints();
api.MapAuthEndpoints();

app.Logger.LogInformation("HTTP server listening on {Url} (nats={Nats})", appUrl, appOptions.NatsUrl);
await app.RunAsync();
