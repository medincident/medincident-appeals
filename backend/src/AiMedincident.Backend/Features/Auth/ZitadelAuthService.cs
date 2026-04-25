using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Caching.Memory;

namespace AiMedincident.Backend.Features.Auth;

public sealed class ZitadelAuthService : IAuthService
{
    internal const int MaxCacheEntries = 10_000;
    internal const string HttpClientName = "zitadel-userinfo";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly Uri _userinfoUri;

    public ZitadelAuthService(IHttpClientFactory httpClientFactory, IMemoryCache cache, string issuer)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _userinfoUri = new Uri(issuer.TrimEnd('/') + "/oidc/v1/userinfo");
    }

    public async Task<AuthResult> VerifiedSubjectAsync(string? authHeader, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(authHeader))
            return new AuthResult.BadRequest("missing Authorization header");

        if (!authHeader.StartsWith("bearer ", StringComparison.OrdinalIgnoreCase))
            return new AuthResult.BadRequest("Authorization must be a Bearer token");

        var token = authHeader["bearer ".Length..].Trim();
        if (token.Length == 0)
            return new AuthResult.BadRequest("empty bearer token");

        if (_cache.TryGetValue<string>(token, out var cachedSub) && cachedSub is not null)
            return new AuthResult.Success(cachedSub);

        var verified = await VerifyAsync(token, ct);
        if (verified is not AuthResult.Success success)
            return verified;

        _cache.Set(token, success.Subject, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(2),
            Size = 1,
        });
        return success;
    }

    public void RemoveToken(string token) => _cache.Remove(token);

    private async Task<AuthResult> VerifyAsync(string token, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, _userinfoUri);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var client = _httpClientFactory.CreateClient(HttpClientName);
        using var resp = await client.SendAsync(req, ct);

        if (resp.StatusCode == HttpStatusCode.Unauthorized)
            return new AuthResult.Unauthorized("userinfo: token rejected");
        if (!resp.IsSuccessStatusCode)
            return new AuthResult.UpstreamError($"userinfo returned {(int)resp.StatusCode}");

        var info = await resp.Content.ReadFromJsonAsync<UserInfo>(ct);
        if (info is null || string.IsNullOrEmpty(info.Sub))
            return new AuthResult.UpstreamError("userinfo returned no sub");

        return new AuthResult.Success(info.Sub);
    }

    private sealed record UserInfo(string? Sub);
}
