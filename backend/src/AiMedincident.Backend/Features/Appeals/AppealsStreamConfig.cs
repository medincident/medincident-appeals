using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace AiMedincident.Backend.Features.Appeals;

public static class AppealsStreamConfig
{
    public const string StreamName = "APPEALS";
    public const string SubmitSubject = "appeals.submit";
    public const string ResultSubjectWildcard = "appeals.result.*";
    public const string DurableConsumer = "appeals-backend";

    public static readonly TimeSpan AckWait = TimeSpan.FromSeconds(180);
    public const int MaxDeliver = 5;
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(7);
    public const int MaxMsgSize = 16 * 1024;
    public static readonly TimeSpan DuplicateWindow = TimeSpan.FromHours(1);

    public static string ResultSubject(string appealId) => $"appeals.result.{appealId}";

    public static async Task EnsureStreamAsync(INatsJSContext jetStream, CancellationToken ct = default)
    {
        var config = new StreamConfig(StreamName, [SubmitSubject, ResultSubjectWildcard])
        {
            Storage = StreamConfigStorage.File,
            Retention = StreamConfigRetention.Limits,
            MaxAge = MaxAge,
            MaxMsgSize = MaxMsgSize,
            DuplicateWindow = DuplicateWindow,
            NumReplicas = 1,
        };
        await jetStream.CreateOrUpdateStreamAsync(config, ct);
    }

    public static ConsumerConfig BuildConsumerConfig() => new(DurableConsumer)
    {
        FilterSubject = SubmitSubject,
        AckPolicy = ConsumerConfigAckPolicy.Explicit,
        AckWait = AckWait,
        MaxDeliver = MaxDeliver,
        DeliverPolicy = ConsumerConfigDeliverPolicy.All,
    };
}
