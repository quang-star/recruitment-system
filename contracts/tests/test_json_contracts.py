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
