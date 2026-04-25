namespace AiMedincident.Backend.Features.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/auth/logout", LogoutAsync);
        return app;
    }

    internal static IResult LogoutAsync(HttpContext http, IAuthService auth)
    {
        var authHeader = http.Request.Headers.Authorization.ToString();
        if (string.IsNullOrEmpty(authHeader) ||
            !authHeader.StartsWith("bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return TypedResults.NoContent();
        }

        var token = authHeader["bearer ".Length..].Trim();
        if (token.Length > 0)
        {
            auth.RemoveToken(token);
        }

        return TypedResults.NoContent();
    }
}
