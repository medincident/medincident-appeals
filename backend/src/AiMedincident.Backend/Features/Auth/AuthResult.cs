namespace AiMedincident.Backend.Features.Auth;

public abstract record AuthResult
{
    private AuthResult() { }

    public sealed record Success(string Subject) : AuthResult;

    public abstract record Failure(string Reason) : AuthResult;
    public sealed record BadRequest(string Reason) : Failure(Reason);
    public sealed record Unauthorized(string Reason) : Failure(Reason);
    public sealed record UpstreamError(string Reason) : Failure(Reason);
}
