from identity_fixtures import new_id
from copy import deepcopy
from unittest.mock import Mock

import pytest

from app.career.catalog_reader import CategoryEntry
from app.career.models import CareerRequest
from app.career.models import CareerSuggestion
from app.career.service import CareerSuggestionService, draft_identity, validate_suggestion
from app.shared.extraction_types import EXTERNAL_AI_POLICY_VERSION


def request(**changes):
    return CareerRequest(
        **(
            {
                "title": "Backend developer",
                "description": "Build Java services.",
                "requirementsText": "Java is required.",
                "externalAiConsent": True,
                "externalAiPolicyVersion": EXTERNAL_AI_POLICY_VERSION,
            }
            | changes
        )
    )


def catalog():
    industry, group, position = new_id(), new_id(), new_id()
    return [
        CategoryEntry(
            id=industry,
            kind="INDUSTRY",
            parentId=None,
            name="CNTT",
            status="ACTIVE",
            version=0,
        ),
        CategoryEntry(
            id=group,
            kind="SPECIALIZATION",
            parentId=industry,
            name="Development",
            status="ACTIVE",
            version=1,
        ),
        CategoryEntry(
            id=position,
            kind="POSITION",
            parentId=group,
            name="Backend",
            status="ACTIVE",
            version=0,
        ),
    ]


def payload(entries):
    choice = {
        f"{key}Id": str(entry.id)
        for key, entry in zip(("industry", "specialization", "position"), entries)
    }
    choice.update(
        {
            f"{key}Name": entry.name
            for key, entry in zip(("industry", "specialization", "position"), entries)
        }
    )
    return {
        "suggestions": [
            {"category": choice, "evidenceQuotes": ["Build Java services."]}
        ]
    }


def fixtures():
    entries = catalog()
    reader = Mock()
    reader.read.return_value = entries
    provider = Mock(
        provider="groq",
        model="synthetic-model",
        usage={"input_tokens": 10, "output_tokens": 2},
    )
    provider.available.return_value = True
    provider.input_limit.return_value = 30000
    provider.generate.return_value = payload(entries)
    budget = Mock()
    budget.reserve.return_value = ("synthetic-request-key", None)
    return reader, provider, budget


def test_suggests_only_valid_categories_with_redacted_grounded_evidence_and_safe_admission():
    reader, provider, budget = fixtures()
    actor = new_id()
    draft = request(description="Build Java services.\nEmail: private@example.test")
    result = CareerSuggestionService(reader, provider, budget).suggest(actor, draft)
    assert result.status == "SUGGESTED" and result.reasonCode is None
    assert len(result.inputHash) == 64 and len(result.catalogHash) == 64
    assert result.suggestions[0].category.positionId == reader.read.return_value[2].id
    source, transmitted_catalog = provider.generate.call_args.args
    assert "private@example.test" not in source and "█" in source
    assert len(transmitted_catalog) == 3
    context, kind, name, model = budget.reserve.call_args.args
    assert context.owner_user_id == actor and context.source_hash == draft.input_hash()
    assert context.resource_id == draft_identity(
        actor, result.inputHash, result.catalogHash
    )
    assert kind == "jd" and name == "groq" and model == "synthetic-model"
    budget.finish.assert_called_once_with(
        "synthetic-request-key", "SUCCEEDED", provider.usage
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"externalAiConsent": False},
        {"externalAiPolicyVersion": None},
        {"externalAiPolicyVersion": "outdated"},
    ],
)
def test_missing_consent_skips_catalog_provider_and_budget(changes):
    reader, provider, budget = fixtures()
    result = CareerSuggestionService(reader, provider, budget).suggest(
        new_id(), request(**changes)
    )
    assert result.reasonCode == "EXTERNAL_AI_NOT_CONSENTED" and result.suggestions == []
    reader.read.assert_not_called()
    provider.generate.assert_not_called()
    budget.reserve.assert_not_called()


@pytest.mark.parametrize("configured", [False, True])
def test_disabled_or_unconfigured_provider_keeps_manual_flow(configured):
    reader, provider, budget = fixtures()
    provider.available.return_value = False
    result = CareerSuggestionService(
        reader, provider if configured else None, budget
    ).suggest(new_id(), request())
    assert result.reasonCode == "EXTERNAL_AI_NOT_CONFIGURED"
    reader.read.assert_not_called()
    budget.reserve.assert_not_called()


@pytest.mark.parametrize(
    "failure",
    [
        "missing",
        "unavailable",
        "limit",
        "duplicate",
        "catalog",
        "oversize",
        "total-input",
    ],
)
def test_admission_failures_never_call_provider(failure):
    reader, provider, budget = fixtures()
    reasons = {
        "missing": "EXTERNAL_AI_BUDGET_UNAVAILABLE",
        "unavailable": "EXTERNAL_AI_BUDGET_UNAVAILABLE",
        "limit": "EXTERNAL_AI_LIMIT_REACHED",
        "duplicate": "EXTERNAL_AI_ALREADY_REQUESTED",
        "catalog": "CATALOG_UNAVAILABLE",
        "oversize": "EXTERNAL_AI_INPUT_SKIPPED",
        "total-input": "EXTERNAL_AI_INPUT_SKIPPED",
    }
    if failure == "missing":
        budget = None
    elif failure == "unavailable":
        budget.reserve.side_effect = RuntimeError("synthetic DB outage")
    elif failure in {"limit", "duplicate"}:
        budget.reserve.return_value = (None, reasons[failure])
    elif failure == "catalog":
        reader.read.side_effect = TimeoutError("synthetic Core timeout")
    elif failure == "oversize":
        provider.input_limit.return_value = 1
    else:
        provider.input_limit.return_value = 200
    result = CareerSuggestionService(reader, provider, budget).suggest(
        new_id(), request()
    )
    assert result.status == "MANUAL" and result.reasonCode == reasons[failure]
    provider.generate.assert_not_called()


@pytest.mark.parametrize(
    "error",
    [
        TimeoutError(),
        ValueError("synthetic HTTP 429"),
        RuntimeError("synthetic transport error"),
    ],
)
def test_provider_failure_returns_manual_without_retry_or_error_body(error, caplog):
    reader, provider, budget = fixtures()
    provider.generate.side_effect = error
    result = CareerSuggestionService(reader, provider, budget).suggest(
        new_id(), request()
    )
    assert result.reasonCode == "PROVIDER_UNAVAILABLE" and result.suggestions == []
    provider.generate.assert_called_once()
    budget.finish.assert_called_once_with(
        "synthetic-request-key", "FALLBACK", provider.usage
    )
    assert not caplog.text


@pytest.mark.parametrize(
    "invalid",
    [
        "id",
        "name",
        "parent",
        "new-parent",
        "blank",
        "newline",
        "long",
        "contact",
        "ungrounded",
        "masked",
        "empty-evidence",
        "matching",
        "extra",
        "duplicate",
        "too-many",
    ],
)
def test_invalid_provider_output_never_becomes_a_category_choice(invalid):
    reader, provider, budget = fixtures()
    raw = deepcopy(provider.generate.return_value)
    choice = raw["suggestions"][0]["category"]
    if invalid == "id":
        choice["positionId"] = str(new_id())
    elif invalid == "name":
        choice["positionName"] = "Different canonical label"
    elif invalid == "parent":
        choice["specializationId"] = choice["positionId"]
    elif invalid == "new-parent":
        choice["industryId"] = None
    elif invalid in {"blank", "newline", "long", "contact"}:
        choice["positionId"] = None
        choice["positionName"] = {
            "blank": "  ",
            "newline": "Back\nend",
            "long": "x" * 161,
            "contact": "private@example.test",
        }[invalid]
    elif invalid in {"ungrounded", "masked", "empty-evidence"}:
        raw["suggestions"][0]["evidenceQuotes"] = {
            "ungrounded": ["Invented duties"],
            "masked": ["█"],
            "empty-evidence": [],
        }[invalid]
    elif invalid == "matching":
        choice["matchingDomain"] = "IT"
    elif invalid == "extra":
        raw["operation"] = "APPROVE"
    elif invalid == "duplicate":
        raw["suggestions"] *= 2
    else:
        raw["suggestions"] *= 4
    provider.generate.return_value = raw
    result = CareerSuggestionService(reader, provider, budget).suggest(
        new_id(), request()
    )
    assert result.reasonCode == "INVALID_SUGGESTION" and result.suggestions == []
    budget.finish.assert_called_once_with(
        "synthetic-request-key", "FALLBACK", provider.usage
    )


def test_new_names_are_review_only_and_empty_suggestions_preserve_manual_input():
    reader, provider, budget = fixtures()
    choice = provider.generate.return_value["suggestions"][0]["category"]
    for key in ("industry", "specialization", "position"):
        choice[f"{key}Id"] = None
        choice[f"{key}Name"] = f"New {key}"
    service = CareerSuggestionService(reader, provider, budget)
    result = service.suggest(new_id(), request())
    assert (
        result.status == "SUGGESTED"
        and result.suggestions[0].category.industryId is None
    )
    provider.generate.return_value = {"suggestions": []}
    assert service.suggest(new_id(), request()).reasonCode == "NO_SUGGESTION"


def test_catalog_or_actor_change_separates_draft_identity_without_faking_source_hash():
    actor, other = new_id(), new_id()
    assert draft_identity(actor, "a" * 64, "b" * 64) == draft_identity(
        actor, "a" * 64, "b" * 64
    )
    assert (
        len(
            {
                draft_identity(actor, "a" * 64, "b" * 64),
                draft_identity(other, "a" * 64, "b" * 64),
                draft_identity(actor, "c" * 64, "b" * 64),
                draft_identity(actor, "a" * 64, "d" * 64),
            }
        )
        == 4
    )


def test_outcome_persistence_failure_does_not_trigger_another_provider_call(caplog):
    reader, provider, budget = fixtures()
    budget.finish.side_effect = RuntimeError("private error content")
    assert (
        CareerSuggestionService(reader, provider, budget)
        .suggest(new_id(), request())
        .status
        == "SUGGESTED"
    )
    provider.generate.assert_called_once()
    assert "private error content" not in caplog.text


def test_masked_contact_only_draft_does_not_spend_admission_or_call_provider():
    reader, provider, budget = fixtures()
    draft = request(title="private@example.test", description="", requirementsText="")
    result = CareerSuggestionService(reader, provider, budget).suggest(new_id(), draft)
    assert result.reasonCode == "EXTERNAL_AI_NO_PROFESSIONAL_CONTENT"
    reader.read.assert_not_called()
    budget.reserve.assert_not_called()
    provider.generate.assert_not_called()


@pytest.mark.parametrize(
    "contact",
    [
        "ｐｒｉｖａｔｅ＠ｅｘａｍｐｌｅ．ｔｅｓｔ",
        "private＠example.test",
        "ｈｔｔｐｓ：／／ｅｘａｍｐｌｅ．ｔｅｓｔ／private",
        "０９１２３４５６７８",
    ],
)
def test_outbound_draft_masks_compatibility_contacts_without_changing_input_identity(contact):
    reader, provider, budget = fixtures()
    draft = request(description=f"Build Java services.\n{contact}")
    original_hash = draft.input_hash()
    result = CareerSuggestionService(reader, provider, budget).suggest(new_id(), draft)
    assert result.status == "SUGGESTED" and result.inputHash == original_hash
    source = provider.generate.call_args.args[0]
    assert contact not in source and "█" in source
    assert "Build Java services." in source
    assert draft.description.endswith(contact)


@pytest.mark.parametrize(
    "contact", ["private＠example.test", "０９１２３４５６７８"]
)
def test_contact_output_is_rejected_even_when_a_source_contains_compatibility_characters(contact):
    reader, _, _ = fixtures()
    raw = payload(reader.read.return_value)["suggestions"][0]
    raw["evidenceQuotes"] = [contact]
    suggestion = CareerSuggestion.model_validate(raw)
    with pytest.raises(ValueError, match="private"):
        validate_suggestion(suggestion, reader.read.return_value, contact)


def test_safe_multilingual_source_and_category_names_remain_available():
    reader, provider, budget = fixtures()
    entries = reader.read.return_value
    entries[2].name = "Phát triển phần mềm 日本語"
    provider.generate.return_value = payload(entries)
    draft = request(description="Build Java services.\nPhát triển phần mềm 日本語")
    result = CareerSuggestionService(reader, provider, budget).suggest(new_id(), draft)
    assert result.status == "SUGGESTED"
    assert result.suggestions[0].category.positionName == entries[2].name
    assert "Phát triển phần mềm 日本語" in provider.generate.call_args.args[0]
