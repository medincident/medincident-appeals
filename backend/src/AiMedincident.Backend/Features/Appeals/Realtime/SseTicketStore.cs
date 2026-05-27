using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace AiMedincident.Backend.Features.Appeals.Realtime;

public sealed class SseTicketStore
{
    public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);
    private const int TicketBytes = 32;

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly TimeProvider _clock;

    public SseTicketStore(TimeProvider clock)
    {
        _clock = clock;
    }

    public Ticket Issue(string subject)
    {
        ArgumentException.ThrowIfNullOrEmpty(subject);

        var raw = RandomNumberGenerator.GetBytes(TicketBytes);
        var token = Convert.ToHexStringLower(raw);
        var expiresAt = _clock.GetUtcNow().Add(Ttl);
        _entries[token] = new Entry(subject, expiresAt);
        Sweep();
        return new Ticket(token, expiresAt);
    }

    public bool TryConsume(string token, out string subject)
    {
        subject = string.Empty;
        if (string.IsNullOrEmpty(token)) return false;

        if (!_entries.TryRemove(token, out var entry))
            return false;

        if (entry.ExpiresAt <= _clock.GetUtcNow())
            return false;

        subject = entry.Subject;
        return true;
    }

    private void Sweep()
    {
        var now = _clock.GetUtcNow();
        foreach (var (token, entry) in _entries)
        {
            if (entry.ExpiresAt <= now)
                _entries.TryRemove(token, out _);
        }
    }

    public sealed record Ticket(string Token, DateTimeOffset ExpiresAt);

    private sealed record Entry(string Subject, DateTimeOffset ExpiresAt);
}
