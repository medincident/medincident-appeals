using System.Net;
using System.Net.Http.Json;
using AiMedincident.Backend.Features.Auth;
using Microsoft.Extensions.Caching.Memory;

namespace AiMedincident.Backend.UnitTests.Auth;

public class ZitadelAuthServiceTests
{
    private readonly StubHttpMessageHandler _handler = new();
    private readonly IHttpClientFactory _factory;
    private readonly IMemoryCache _cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 100 });

    public ZitadelAuthServiceTests()
    {
        var client = new HttpClient(_handler) { BaseAddress = new Uri("https://issuer.test") };
        _factory = new SingleClientFactory(client);
    }

    private ZitadelAuthService Create(string issuer = "https://issuer.test") =>
        new(_factory, _cache, issuer);

    private sealed class SingleClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => client;
    }

    [Fact]
    public async Task BadRequest_when_header_missing()
    {
        var result = await Create().VerifiedSubjectAsync(null);

        result.Should().BeOfType<AuthResult.BadRequest>()
            .Which.Reason.Should().Contain("missing");
    }

    [Fact]
    public async Task BadRequest_when_header_not_bearer()
    {
        var result = await Create().VerifiedSubjectAsync("Basic foo");

        result.Should().BeOfType<AuthResult.BadRequest>()
            .Which.Reason.Should().Contain("Bearer");
    }

    [Fact]
    public async Task BadRequest_when_token_empty()
    {
        var result = await Create().VerifiedSubjectAsync("Bearer   ");

        result.Should().BeOfType<AuthResult.BadRequest>()
            .Which.Reason.Should().Contain("empty");
    }

    [Fact]
    public async Task Success_with_subject_from_userinfo_on_200()
    {
        _handler.Respond(HttpStatusCode.OK, new { sub = "user-123" });

        var result = await Create().VerifiedSubjectAsync("Bearer abc");

        result.Should().BeOfType<AuthResult.Success>()
            .Which.Subject.Should().Be("user-123");
        _handler.Calls.Should().Be(1);
    }

    [Fact]
    public async Task Unauthorized_when_userinfo_rejects_token()
    {
        _handler.Respond(HttpStatusCode.Unauthorized, new { });

        var result = await Create().VerifiedSubjectAsync("Bearer bad");

        result.Should().BeOfType<AuthResult.Unauthorized>()
            .Which.Reason.Should().Contain("rejected");
    }

    [Fact]
    public async Task UpstreamError_when_userinfo_has_no_sub()
    {
        _handler.Respond(HttpStatusCode.OK, new { });

        var result = await Create().VerifiedSubjectAsync("Bearer abc");

        result.Should().BeOfType<AuthResult.UpstreamError>()
            .Which.Reason.Should().Contain("no sub");
    }

    [Fact]
    public async Task Caches_subject_between_calls()
    {
        _handler.Respond(HttpStatusCode.OK, new { sub = "user-123" });
        var svc = Create();

        await svc.VerifiedSubjectAsync("Bearer abc");
        await svc.VerifiedSubjectAsync("Bearer abc");

        _handler.Calls.Should().Be(1);
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private HttpStatusCode _status = HttpStatusCode.OK;
        private object _body = new { };
        public int Calls { get; private set; }

        public void Respond(HttpStatusCode status, object body)
        {
            _status = status;
            _body = body;
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            var resp = new HttpResponseMessage(_status) { Content = JsonContent.Create(_body) };
            await Task.Yield();
            return resp;
        }
    }
}
