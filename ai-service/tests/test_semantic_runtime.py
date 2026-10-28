from unittest.mock import Mock
import pytest
from app.matching.semantic import compare_hybrid, MODEL_ID, MODEL_REVISION

CV = {"skills": [{"raw": "Java", "provenance": "EXTRACTED"}]}
JD = {"title": {"raw": "Backend"}, "requirements": {"requiredSkills": [{"raw": "Java"}]}}


def test_injected_embedding_provider_returns_pinned_comparison_without_changing_baseline():
    provider = Mock()
    provider.embed.return_value = [[1., 0.], [1., 0.]]
    result = compare_hybrid(CV, JD, 60., provider=provider)
    assert result.baseline_score == 60 and result.semantic_score == 100 and result.hybrid_score == 68
    assert result.status == "SHADOW" and result.model_id == MODEL_ID and result.model_revision == MODEL_REVISION
    provider.embed.assert_called_once_with(["Java", "Backend\nJava"])


@pytest.mark.parametrize("vectors", [[[0., 0.], [1., 0.]], [[float("nan")], [1.]], [[1., 0.], [1.]], [None, [1.]]])
def test_bad_embeddings_retain_exact_baseline_with_explicit_reason(vectors):
    provider = Mock()
    provider.embed.return_value = vectors
    result = compare_hybrid(CV, JD, 73.5, provider=provider)
    assert result.hybrid_score == 73.5 and result.semantic_score is None
    assert result.fallback_code == "SEMANTIC_EMBEDDING_FAILED"


def test_missing_model_text_input_limit_and_provider_failure_do_not_block_baseline():
    provider = Mock()
    provider.embed.side_effect = RuntimeError("private model detail")
    assert compare_hybrid(CV, JD, 80, provider=provider).fallback_code == "SEMANTIC_EMBEDDING_FAILED"
    assert compare_hybrid(CV, JD, 80).fallback_code == "SEMANTIC_MODEL_UNAVAILABLE"
    assert compare_hybrid({}, JD, 80, provider=provider).fallback_code == "SEMANTIC_TEXT_UNAVAILABLE"
    assert compare_hybrid(CV, JD, 80, provider=provider, max_chars=2).fallback_code == "SEMANTIC_INPUT_LIMIT"
    with pytest.raises(ValueError):
        compare_hybrid(CV, JD, float("nan"), provider=provider)
