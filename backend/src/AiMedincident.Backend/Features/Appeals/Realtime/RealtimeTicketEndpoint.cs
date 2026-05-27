using AiMedincident.Backend.Features.Auth;

namespace AiMedincident.Backend.Features.Appeals.Realtime;

public static class RealtimeTicketEndpoint
{
    public static IEndpointRouteBuilder MapRealtimeTicketEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/users/{userId}/realtime/tickets", IssueAsync)
            .AddEndpointFilter<UserAuthFilter>();
        return app;
    }

    internal sealed record TicketResponse(string Token, DateTimeOffset ExpiresAt);

    internal static IResult IssueAsync(string userId, SseTicketStore tickets)
    {
        var ticket = tickets.Issue(userId);
        return TypedResults.Ok(new TicketResponse(ticket.Token, ticket.ExpiresAt));
    }
}
