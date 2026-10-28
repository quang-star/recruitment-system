from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError


CONTRACTS_ROOT = Path(__file__).resolve().parents[1]
SCHEMAS_ROOT = CONTRACTS_ROOT / "schemas"
EXAMPLES_ROOT = CONTRACTS_ROOT / "examples"
TAXONOMY_ROOT = CONTRACTS_ROOT / "taxonomy"


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def validator(schema_name: str) -> Draft202012Validator:
    schema = load_json(SCHEMAS_ROOT / schema_name)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def event_validator(schema_name: str) -> Draft202012Validator:
    schema = load_json(CONTRACTS_ROOT / "events" / schema_name)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def test_paged_lists_accept_empty_pages_but_reject_invalid_metadata() -> None:
    valid = {"items": [], "total": 30, "page": 8, "size": 12}
    validator("page-response-v1.schema.json").validate(valid)
    for key, value in (("page", -1), ("size", 101), ("total", -1), ("items", "not-a-list")):
        with pytest.raises(ValidationError):
            validator("page-response-v1.schema.json").validate({**valid, key: value})


def test_matching_result_generation_is_additive_and_bounded() -> None:
    identifier = "779494ac-c858-4570-a884-6e88423b8e2b"
    event = {"applicationId": identifier, "cvVersionId": identifier, "jobVersionId": identifier,
             "matchingResultId": identifier, "status": "COMPLETED", "finalScore": 70,
             "algorithmVersion": "baseline-v5", "taxonomyVersion": "1.0.0"}
    schema = event_validator("matching-completed-v1.schema.json")
    schema.validate(event)  # Legacy events truthfully carry no generation.
    schema.validate({**event, "resultGeneration": None, "supersedesMatchingResultId": None})
    schema.validate({**event, "resultGeneration": 2, "supersedesMatchingResultId": identifier})
    for generation in (0, -1, 1.5, "2", True, 9223372036854775808):
        with pytest.raises(ValidationError):
            schema.validate({**event, "resultGeneration": generation})
    with pytest.raises(ValidationError):
        schema.validate({**event, "supersedesMatchingResultId": "not-a-uuid"})


@pytest.mark.parametrize("schema_path", sorted(CONTRACTS_ROOT.rglob("*.schema.json")))
def test_all_json_schemas_are_valid_draft_2020_12(schema_path: Path) -> None:
    schema = load_json(schema_path)

    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["$id"].startswith("https://smart-recruitment.local/contracts/")
    Draft202012Validator.check_schema(schema)


@pytest.mark.parametrize(
    ("schema_name", "example_name"),
    [
        ("parsed-cv-v1.schema.json", "parsed-cv-v1.example.json"),
        ("parsed-jd-v1.schema.json", "parsed-jd-v1.example.json"),
        ("cv-response-v1.schema.json", "cv-response-v1.example.json"),
    ],
)
def test_parsed_examples_match_their_contracts(schema_name: str, example_name: str) -> None:
    validator(schema_name).validate(load_json(EXAMPLES_ROOT / example_name))


def test_parsed_cv_rejects_pii_and_inconsistent_normalization() -> None:
    parsed_cv = load_json(EXAMPLES_ROOT / "parsed-cv-v1.example.json")
    parsed_cv["email"] = "candidate@example.com"

    with pytest.raises(ValidationError):
        validator("parsed-cv-v1.schema.json").validate(parsed_cv)

    parsed_cv = load_json(EXAMPLES_ROOT / "parsed-cv-v1.example.json")
    parsed_cv["skills"][0]["canonicalSkillId"] = None

    with pytest.raises(ValidationError):
        validator("parsed-cv-v1.schema.json").validate(parsed_cv)


def test_current_experience_cannot_have_an_end_month() -> None:
    parsed_cv = load_json(EXAMPLES_ROOT / "parsed-cv-v1.example.json")
    parsed_cv["experiences"][0]["endMonth"] = "2026-08"

    with pytest.raises(ValidationError):
        validator("parsed-cv-v1.schema.json").validate(parsed_cv)


def test_parsed_jd_rejects_a_canonical_id_for_an_unresolved_skill() -> None:
    parsed_jd = load_json(EXAMPLES_ROOT / "parsed-jd-v1.example.json")
    skill = parsed_jd["requirements"]["requiredSkills"][0]
    skill["normalizationStatus"] = "UNRESOLVED"

    with pytest.raises(ValidationError):
        validator("parsed-jd-v1.schema.json").validate(parsed_jd)


def test_taxonomy_seed_is_valid_and_has_unambiguous_identifiers() -> None:
    taxonomy = load_json(TAXONOMY_ROOT / "it-skills-v1.seed.json")
    validator("skill-taxonomy-v1.schema.json").validate(taxonomy)

    stable_ids = [skill["stableId"] for skill in taxonomy["skills"]]
    assert len(stable_ids) == len(set(stable_ids))

    normalized_terms: list[str] = []
    for skill in taxonomy["skills"]:
        normalized_terms.append(skill["normalizedName"])
        normalized_terms.extend(alias["normalized"] for alias in skill["aliases"])
    assert len(normalized_terms) == len(set(normalized_terms))

    known_ids = set(stable_ids)
    for skill in taxonomy["skills"]:
        for relation in skill["relations"]:
            assert relation["targetSkillId"] in known_ids
            assert relation["targetSkillId"] != skill["stableId"]


def test_taxonomy_rejects_unknown_fields() -> None:
    taxonomy = copy.deepcopy(load_json(TAXONOMY_ROOT / "it-skills-v1.seed.json"))
    taxonomy["skills"][0]["runtimeOnlyScore"] = 0.9

    with pytest.raises(ValidationError):
        validator("skill-taxonomy-v1.schema.json").validate(taxonomy)


def test_job_processing_event_contracts_reject_raw_jd_fields() -> None:
    event = {
        "jobId": "779494ac-c858-4570-a884-6e88423b8e2b",
        "jobVersionId": "779494ac-c858-4570-a884-6e88423b8e2b",
        "processingTaskId": "779494ac-c858-4570-a884-6e88423b8e2b",
        "sourceHash": "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        "status": "PARSED",
        "failureCode": None,
    }
    event_validator("job-processing-updated-v1.schema.json").validate(event)
    event["description"] = "raw JD must not be put in Kafka"
    with pytest.raises(ValidationError):
        event_validator("job-processing-updated-v1.schema.json").validate(event)


def test_job_submission_uses_private_object_reference_instead_of_raw_jd() -> None:
    event = {
        "jobId": "779494ac-c858-4570-a884-6e88423b8e2b",
        "jobVersionId": "879494ac-c858-4570-a884-6e88423b8e2b",
        "recruiterUserId": "979494ac-c858-4570-a884-6e88423b8e2b",
        "sourceHash": "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        "objectRef": "private-jd/jobs/779494ac/version.json",
    }
    event_validator("job-version-submitted-v1.schema.json").validate(event)
    event["description"] = "raw JD must not be put in Kafka"
    with pytest.raises(ValidationError):
        event_validator("job-version-submitted-v1.schema.json").validate(event)


@pytest.mark.parametrize("kind", ["cv", "jd"])
def test_external_ai_consent_is_optional_for_legacy_events_but_requires_policy_when_granted(kind: str) -> None:
    event = {
        "sourceHash": "a" * 64,
        "objectRef": "private-sources/synthetic-version",
    }
    identity = "779494ac-c858-4570-a884-6e88423b8e2b"
    if kind == "cv":
        schema_name = "cv-uploaded-v1.schema.json"
        event.update(cvId=identity, cvVersionId=identity, candidateUserId=identity)
    else:
        schema_name = "job-version-submitted-v1.schema.json"
        event.update(jobId=identity, jobVersionId=identity, recruiterUserId=identity)
    contract = event_validator(schema_name)
    contract.validate(event)
    contract.validate({**event, "externalAiConsent": False, "externalAiPolicyVersion": None})
    contract.validate({**event, "externalAiConsent": True, "externalAiPolicyVersion": "external-ai/1.0"})
    for fields in [
        {"externalAiConsent": True},
        {"externalAiConsent": True, "externalAiPolicyVersion": None},
        {"externalAiConsent": True, "externalAiPolicyVersion": ""},
        {"externalAiConsent": 1, "externalAiPolicyVersion": "external-ai/1.0"},
    ]:
        with pytest.raises(ValidationError):
            contract.validate({**event, **fields})
