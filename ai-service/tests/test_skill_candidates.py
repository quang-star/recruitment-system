from copy import deepcopy
from unittest.mock import Mock, patch

import pytest

from app.taxonomy.candidates import ALGORITHM_VERSION, MODEL_ID, MODEL_REVISION, suggest_skills
from app.taxonomy.normalizer import Taxonomy, build_taxonomy, normalize_skill, use_taxonomy


def catalog():
    return build_taxonomy({"semanticVersion": "1.0.42", "skills": [
        {"stableId": "react", "canonicalName": "React", "normalizedName": "react",
         "aliases": [{"value": "React.js", "normalized": "reactjs"}]},
        {"stableId": "java", "canonicalName": "Java", "normalizedName": "java", "aliases": []},
        {"stableId": "cpp", "canonicalName": "C++", "normalizedName": "c++", "aliases": []},
        {"stableId": "csharp", "canonicalName": "C#", "normalizedName": "c#", "aliases": []},
    ]})


@pytest.mark.parametrize("term,expected", [("React", "react"), (" REACT.JS ", "react"), ("ReactJS", "react"),
                                           ("C++", "cpp"), ("C#", "csharp")])
def test_exact_alias_has_priority_without_model_or_fuzzy_noise(term, expected):
    provider = Mock()
    result = suggest_skills(term, catalog(), semantic=True, provider=provider)
    assert result.resolution == "EXACT_ALIAS" and not result.requiresReview
    assert [candidate.skillId for candidate in result.candidates] == [expected]
    assert result.candidates[0].fuzzyScore == 1 and result.candidates[0].semanticScore is None
    assert result.semanticStatus == "NOT_NEEDED"
    provider.embed.assert_not_called()


def test_unknown_typo_ranks_aliases_once_and_never_assigns_canonical_or_mutates_snapshot():
    taxonomy = catalog()
    before = deepcopy(taxonomy)
    result = suggest_skills("React.jss", taxonomy)
    assert result.resolution == "UNRESOLVED" and result.requiresReview
    assert result.candidates[0].skillId == "react" and result.candidates[0].matchedAlias == "react.js"
    assert len({candidate.skillId for candidate in result.candidates}) == len(result.candidates)
    assert result.taxonomyVersion == "1.0.42" and result.algorithmVersion == ALGORITHM_VERSION
    assert result.scorePolicy == "RANKING_ONLY_UNCALIBRATED" and result.semanticStatus == "DISABLED"
    assert taxonomy == before
    with use_taxonomy(taxonomy):
        assert normalize_skill("React.jss") is None


def test_tied_ranking_is_stable_and_results_are_bounded():
    taxonomy = Taxonomy("1", {"aaa": ("b", "B"), "bbb": ("a", "A")}, ())
    assert suggest_skills("zzz", taxonomy, limit=1).candidates[0].skillId == "a"
    assert suggest_skills("zzz", Taxonomy("1", dict(reversed(list(taxonomy.by_alias.items()))), ())).candidates == suggest_skills("zzz", taxonomy).candidates


@pytest.mark.parametrize("term,limit", [("", 5), (" ", 5), ("x" * 241, 5), ("valid", 0), ("valid", 21)])
def test_invalid_query_bounds_are_rejected(term, limit):
    with pytest.raises(ValueError):
        suggest_skills(term, catalog(), limit=limit)


def test_semantic_ranks_separately_with_pinned_metadata_and_no_auto_resolution():
    provider = Mock()
    # Fuzzy first puts React before Java, but semantic can rank Java first.
    provider.embed.side_effect = lambda texts: [[1., 0.], *([1., 0.] if text == "Java" else [0., 1.] for text in texts[1:])]
    result = suggest_skills("React.jss", catalog(), semantic=True, provider=provider, limit=2)
    assert result.semanticStatus == "AVAILABLE" and result.requiresReview and result.resolution == "UNRESOLVED"
    assert result.candidates[0].skillId == "java" and result.candidates[0].semanticScore == 1
    assert result.modelId == MODEL_ID and result.modelRevision == MODEL_REVISION
    assert result.response()["scorePolicy"] == "RANKING_ONLY_UNCALIBRATED"


@pytest.mark.parametrize("vectors", [[], [None] * 5, [[0., 0.]] * 5,
                                      [[1., 0.], *([[float("nan"), 0.]] * 4)],
                                      [[1.], *([[1., 0.]] * 4)], [[1e308]] * 5])
def test_invalid_embeddings_fall_back_to_same_lexical_results(vectors):
    provider = Mock()
    provider.embed.return_value = vectors
    result = suggest_skills("React.jss", catalog(), semantic=True, provider=provider)
    assert result.semanticStatus == "EMBEDDING_FAILED"
    assert result.candidates == suggest_skills("React.jss", catalog()).candidates


def test_unavailable_failed_and_input_limited_model_preserve_fuzzy_review():
    provider = Mock()
    provider.embed.side_effect = RuntimeError("private model detail")
    assert suggest_skills("React.jss", catalog(), semantic=True).semanticStatus == "MODEL_UNAVAILABLE"
    assert suggest_skills("React.jss", catalog(), semantic=True, provider=provider).semanticStatus == "EMBEDDING_FAILED"
    assert suggest_skills("React.jss", catalog(), semantic=True, provider=provider, max_chars=1).semanticStatus == "INPUT_LIMIT"
    with patch("app.taxonomy.candidates.local_provider", side_effect=RuntimeError("private path")):
        response = suggest_skills("React.jss", catalog(), semantic=True, cache_directory="synthetic/model").response()
    assert response["semanticStatus"] == "MODEL_UNAVAILABLE" and "private" not in str(response)


def test_empty_and_over_limit_catalog_do_not_load_model():
    provider = Mock()
    result = suggest_skills("Unknown", Taxonomy("1", {}, ()), semantic=True, provider=provider)
    assert result.candidates == [] and result.semanticStatus == "NO_CANONICAL_SKILLS"
    oversized = Taxonomy("1", {str(index): (str(index), str(index)) for index in range(1001)}, ())
    with pytest.raises(ValueError, match="catalog limit"):
        suggest_skills("Unknown", oversized, semantic=True, provider=provider)
    provider.embed.assert_not_called()


def test_legacy_private_names_and_aliases_are_excluded_without_snapshot_rewrite():
    taxonomy = Taxonomy("1", {
        "java": ("java", "Java"),
        "candidate@example.invalid": ("java", "Java"),
        "hidden": ("private", "ｃａｎｄｉｄａｔｅ＠ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ"),
    }, ())
    before = deepcopy(taxonomy)
    provider = Mock()
    provider.embed.return_value = [[1., 0.], [1., 0.]]
    result = suggest_skills("Unknown", taxonomy, semantic=True, provider=provider)
    assert [candidate.skillId for candidate in result.candidates] == ["java"]
    provider.embed.assert_called_once_with(["Unknown", "Java"])
    assert taxonomy == before
