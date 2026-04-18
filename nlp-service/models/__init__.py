from .classifier import ImportanceClassifier
from .seq2seq import TextProcessor
from .similarity import CategoryMatcher


def get_device() -> str:
    """CUDA → MPS (Apple Silicon) → CPU."""
    import torch
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


__all__ = ["ImportanceClassifier", "TextProcessor", "CategoryMatcher", "get_device"]
