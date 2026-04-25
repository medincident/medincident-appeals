namespace AiMedincident.Backend.Features.Auth;

public interface IAuthService
{
    Task<AuthResult> VerifiedSubjectAsync(string? authHeader, CancellationToken ct = default);

    void RemoveToken(string token);
}
