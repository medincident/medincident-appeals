namespace AiMedincident.Backend.Features.Appeals;

public abstract record ProcessResult
{
    private ProcessResult() { }

    public sealed record Success : ProcessResult;

    public abstract record Failure(string Reason) : ProcessResult;
    public sealed record InvalidMessage(string Reason) : Failure(Reason);
    public sealed record AppealAnalyzeFailure(string Reason) : Failure(Reason);
    public sealed record DbFailure(string Reason) : Failure(Reason);
    public sealed record PublishFailure(string Reason) : Failure(Reason);
    public sealed record SubmissionFailure(string Reason) : Failure(Reason);
}
