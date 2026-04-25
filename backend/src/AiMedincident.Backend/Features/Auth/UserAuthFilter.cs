namespace AiMedincident.Backend.Features.Auth;

internal sealed class UserAuthFilter(
    IAuthService auth,
    ILogger<UserAuthFilter> logger) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var userId = http.Request.RouteValues["userId"] as string;

        if (string.IsNullOrEmpty(userId))
            return TypedResults.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "missing userId");

        var authHeader = http.Request.Headers.Authorization.ToString();
        var result = await auth.VerifiedSubjectAsync(authHeader, http.RequestAborted);

        if (result is AuthResult.Failure failure)
        {
            logger.LogWarning("Auth failed (path={Path}): {Reason}", http.Request.Path, failure.Reason);
            return TypedResults.Problem(
                statusCode: StatusCodes.Status401Unauthorized,
                title: "unauthorized");
        }

        if (((AuthResult.Success)result).Subject != userId)
            return TypedResults.Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "cannot access another user's resources");

        return await next(context);
    }
}
