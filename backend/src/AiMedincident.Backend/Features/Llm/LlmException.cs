namespace AiMedincident.Backend.Features.Llm;

public class LlmException(string message, Exception? inner = null) : Exception(message, inner);

public sealed class LlmBulkheadRejectedException(string message, Exception? inner = null)
    : LlmException(message, inner);

public sealed class LlmTimeoutException(string message, Exception? inner = null)
    : LlmException(message, inner);
