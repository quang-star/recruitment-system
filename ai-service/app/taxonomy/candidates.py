"""Rank canonical suggestions without changing normalization or hiring scores."""
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
import math

from app.matching.semantic import EmbeddingProvider, MODEL_ID, MODEL_REVISION, local_provider
from app.shared.extraction_privacy import redact_contacts
from app.taxonomy.normalizer import Taxonomy, _key


ALGORITHM_VERSION = "skill-candidate-ranking-v1"
MAX_SKILLS = 1000


def _safe_label(value: str) -> bool:
    return "█" not in value and redact_contacts(value) == value and redact_contacts(_key(value)) == _key(value)


@dataclass(frozen=True, slots=True)
class SkillCandidate:
    skillId: str
    canonicalName: str
    matchedAlias: str
    fuzzyScore: float
    semanticScore: float | None = None


@dataclass(frozen=True, slots=True)
class SkillCandidateResult:
    taxonomyVersion: str
    resolution: str
    requiresReview: bool
    candidates: list[SkillCandidate]
    semanticStatus: str
    algorithmVersion: str = ALGORITHM_VERSION
    scorePolicy: str = "RANKING_ONLY_UNCALIBRATED"
    rankingMethod: str = "FUZZY_RATIO"
    fuzzyMethod: str = "SEQUENCE_MATCHER_RATIO_AUTOJUNK"
    modelId: str | None = None
    modelRevision: str | None = None

    def response(self) -> dict:
        return asdict(self)


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right) or any(not math.isfinite(value) for value in left + right):
        raise ValueError("Invalid embedding")
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not math.isfinite(left_norm + right_norm) or left_norm == 0 or right_norm == 0:
        raise ValueError("Invalid embedding norm")
    return round(max(-1., min(1., sum(a * b for a, b in zip(left, right)) / left_norm / right_norm)), 6)


def suggest_skills(raw: str, taxonomy: Taxonomy, *, limit: int = 5,
                   semantic: bool = False, provider: EmbeddingProvider | None = None,
                   cache_directory: str | None = None, max_chars: int = 20000) -> SkillCandidateResult:
    """Exact/alias wins; unknown terms remain pending even with a perfect ranking.

    Fuzzy ratio and optional cosine are separate similarity measures, never a
    calibrated probability. No threshold, auto-merge or canonical assignment is
    derived here. Semantic models are local-only and use the existing pin.
    """
    term = _key(raw)
    if not term or len(raw) > 240 or not 1 <= limit <= 20 or max_chars < 1:
        raise ValueError("Invalid skill candidate input")
    if len(taxonomy.by_alias) > MAX_SKILLS * 102:
        raise ValueError("Skill candidate alias limit exceeded")
    # Old snapshots stay immutable, but private legacy labels must not enter
    # the Admin suggestion response or the local model's input.
    aliases = {alias: entry for alias, entry in taxonomy.by_alias.items()
               if _safe_label(alias) and _safe_label(entry[1])}
    exact = aliases.get(term)
    if exact is not None:
        skill_id, name = exact
        return SkillCandidateResult(taxonomy.version, "EXACT_ALIAS", False,
                                    [SkillCandidate(skill_id, name, raw.strip(), 1.)], "NOT_NEEDED",
                                    rankingMethod="EXACT_ALIAS")
    best: dict[str, SkillCandidate] = {}
    for alias, (skill_id, name) in aliases.items():
        # Keep difflib's long-string repetition heuristic to bound work on
        # repetitive terms; these are uncalibrated suggestions for review.
        score = round(SequenceMatcher(None, term, alias).ratio(), 6)
        candidate = SkillCandidate(skill_id, name, alias, score)
        old = best.get(skill_id)
        if old is None or score > old.fuzzyScore or (score == old.fuzzyScore and alias < old.matchedAlias):
            best[skill_id] = candidate
    if len(best) > MAX_SKILLS:
        raise ValueError("Skill candidate catalog limit exceeded")
    lexical = sorted(best.values(), key=lambda value: (-value.fuzzyScore, value.skillId))
    if not semantic:
        return SkillCandidateResult(taxonomy.version, "UNRESOLVED", True, lexical[:limit], "DISABLED")
    if not lexical:
        return SkillCandidateResult(taxonomy.version, "UNRESOLVED", True, [], "NO_CANONICAL_SKILLS")

    def fallback(status: str) -> SkillCandidateResult:
        return SkillCandidateResult(taxonomy.version, "UNRESOLVED", True, lexical[:limit], status,
                                    modelId=MODEL_ID, modelRevision=MODEL_REVISION)

    texts = [raw.strip(), *(value.canonicalName for value in lexical)]
    if sum(len(value) for value in texts) > max_chars:
        return fallback("INPUT_LIMIT")
    if provider is None:
        if not cache_directory:
            return fallback("MODEL_UNAVAILABLE")
        try:
            provider = local_provider(cache_directory)
        except Exception:
            return fallback("MODEL_UNAVAILABLE")
    try:
        vectors = provider.embed(texts)
        if len(vectors) != len(texts) or any(vector is None for vector in vectors):
            raise ValueError("Missing embeddings")
        query = vectors[0]
        if query is None:
            raise ValueError("Missing query embedding")
        ranked = []
        for candidate, vector in zip(lexical, vectors[1:]):
            if vector is None:
                raise ValueError("Missing canonical embedding")
            ranked.append(SkillCandidate(candidate.skillId, candidate.canonicalName, candidate.matchedAlias,
                                        candidate.fuzzyScore, _cosine(query, vector)))
    except Exception:
        return fallback("EMBEDDING_FAILED")
    ranked.sort(key=lambda value: (-(value.semanticScore if value.semanticScore is not None else -1.),
                                   -value.fuzzyScore, value.skillId))
    return SkillCandidateResult(taxonomy.version, "UNRESOLVED", True, ranked[:limit], "AVAILABLE",
                                rankingMethod="SEMANTIC_COSINE",
                                modelId=MODEL_ID, modelRevision=MODEL_REVISION)
