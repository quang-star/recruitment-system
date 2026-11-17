"""Hybrid candidate evaluation. Baseline remains the published hiring score until human evaluation."""
from dataclasses import dataclass
from functools import lru_cache
import math
from pathlib import Path
from typing import Protocol

from app.evaluation.semantic import (MODEL_ID, MODEL_REVISION, SEMANTIC_WEIGHT, HYBRID_VERSION,
                                    cv_text, jd_text, embed_documents, blend, load_embedding_model)


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float] | None]: ...


class LocalMiniLmProvider:
    def __init__(self, cache_directory: str):
        # Lazy optional dependencies; local-only and a pinned revision prevent runtime downloads.
        self.model = load_embedding_model(Path(cache_directory), local_only=True)

    def embed(self, texts: list[str]) -> list[list[float] | None]:
        vectors, _ = embed_documents(self.model, texts)
        return [vector.tolist() if vector is not None else None for vector in vectors]


@lru_cache(maxsize=1)
def local_provider(cache_directory: str) -> EmbeddingProvider:
    return LocalMiniLmProvider(cache_directory)


@dataclass(frozen=True, slots=True)
class HybridComparison:
    baseline_score: float
    semantic_score: float | None
    hybrid_score: float
    status: str
    fallback_code: str | None
    algorithm_version: str = HYBRID_VERSION
    model_id: str = MODEL_ID
    model_revision: str = MODEL_REVISION
    semantic_weight: float = SEMANTIC_WEIGHT


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right) or any(not math.isfinite(v) for v in left + right):
        raise ValueError("Invalid embedding")
    a = math.sqrt(sum(v * v for v in left))
    b = math.sqrt(sum(v * v for v in right))
    if a == 0 or b == 0:
        raise ValueError("Zero embedding")
    return round(max(0., min(1., sum(x * y for x, y in zip(left, right)) / a / b)) * 100, 2)


def compare_hybrid(cv: dict, jd: dict, baseline: float, *, provider: EmbeddingProvider | None = None,
                   cache_directory: str | None = None, max_chars: int = 20000) -> HybridComparison:
    blend(baseline, None)  # Validate caller score independently of model failures.
    texts = [cv_text(cv), jd_text(jd)]
    if any(not value.strip() for value in texts):
        return HybridComparison(baseline, None, baseline, "BASELINE_ONLY", "SEMANTIC_TEXT_UNAVAILABLE")
    if any(len(value) > max_chars for value in texts):
        return HybridComparison(baseline, None, baseline, "BASELINE_ONLY", "SEMANTIC_INPUT_LIMIT")
    if provider is None:
        if not cache_directory:
            return HybridComparison(baseline, None, baseline, "BASELINE_ONLY", "SEMANTIC_MODEL_UNAVAILABLE")
        try:
            provider = local_provider(cache_directory)
        except Exception:
            return HybridComparison(baseline, None, baseline, "BASELINE_ONLY", "SEMANTIC_MODEL_UNAVAILABLE")
    try:
        vectors = provider.embed(texts)
        if len(vectors) != 2 or vectors[0] is None or vectors[1] is None:
            raise ValueError("Missing embedding")
        semantic = _cosine(vectors[0], vectors[1])
    except Exception:
        return HybridComparison(baseline, None, baseline, "BASELINE_ONLY", "SEMANTIC_EMBEDDING_FAILED")
    return HybridComparison(baseline, semantic, blend(baseline, semantic), "SHADOW", None)
