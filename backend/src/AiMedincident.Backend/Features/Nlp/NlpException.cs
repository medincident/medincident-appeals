namespace AiMedincident.Backend.Features.Nlp;

public class NlpException(string message, Exception? inner = null) : Exception(message, inner);

public sealed class NlpBulkheadRejectedException(string message, Exception? inner = null)
    : NlpException(message, inner);

public sealed class NlpCircuitOpenException(string message, Exception? inner = null)
    : NlpException(message, inner);

public sealed class NlpTimeoutException(string message, Exception? inner = null)
    : NlpException(message, inner);
