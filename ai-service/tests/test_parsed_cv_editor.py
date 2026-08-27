from __future__ import annotations

import copy
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.cv.api import UpdateParsedCvRequest, _validate_user_payload
from app.cv.repository import ParsedCvRevisionRecord, ParsedCvRevisionRepository
from app.shared.api import ApiContractError


EXAMPLE = Path(__file__).resolve().parents[2] / "contracts" / "examples" / "parsed-cv-v1.example.json"
CV_VERSION_ID = UUID("779494ac-c858-4570-a884-6e88423b8e2b")


def payload() -> dict:
    value = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    value["document"]["cvVersionId"] = str(CV_VERSION_ID)
    return value


def test_user_payload_confirms_skills_from_the_prior_owned_revision() -> None:
    prior = payload()
    value = copy.deepcopy(prior)
    value["skills"][0].pop("provenance", None)

    validated = _validate_user_payload(CV_VERSION_ID, value, prior)

    assert validated["skills"][0]["provenance"] == "USER_CONFIRMED"
    assert validated["skills"][1]["provenance"] == "USER_CONFIRMED"
    assert validated["skills"][0]["evidenceIds"] == prior["skills"][0]["evidenceIds"]


def test_user_payload_normalizes_known_skill_and_preserves_unknown_as_pending() -> None:
    value = payload()
    value["skills"] = [
        {
            "raw": "ReactJS", "canonicalSkillId": None, "normalizationStatus": "UNRESOLVED",
            "evidenceIds": [], "confidence": 1, "provenance": "USER_ASSERTED",
        },
        {
            "raw": "InternalPlatformX", "canonicalSkillId": None,
            "normalizationStatus": "UNRESOLVED", "evidenceIds": [], "confidence": 1,
            "provenance": "USER_ASSERTED",
        },
    ]

    validated = _validate_user_payload(CV_VERSION_ID, value)

    assert validated["skills"][0]["normalizationStatus"] == "KNOWN"
    assert validated["skills"][0]["canonicalSkillId"] == "d4f49f3b-a28e-5fd3-b558-94beba4054c0"
    assert validated["skills"][1]["normalizationStatus"] == "PENDING"
    assert validated["skills"][1]["canonicalSkillId"] is None
    assert all(skill["provenance"] == "USER_ASSERTED" for skill in validated["skills"])
    assert all(skill["evidenceIds"] == [] for skill in validated["skills"])


def test_new_skill_cannot_forge_parser_evidence_or_provenance() -> None:
    prior = payload()
    value = payload()
    value["skills"] = [{
        "raw": "ReactJS",
        "canonicalSkillId": "d4f49f3b-a28e-5fd3-b558-94beba4054c0",
        "normalizationStatus": "KNOWN",
        "evidenceIds": ["f851769d-9cdd-4dd2-a34a-157608f2432e"],
        "confidence": 1,
        "provenance": "USER_CONFIRMED",
    }]

    validated = _validate_user_payload(CV_VERSION_ID, value, prior)

    assert validated["skills"][0]["provenance"] == "USER_ASSERTED"
    assert validated["skills"][0]["evidenceIds"] == []


@pytest.mark.parametrize("mutation", [
    lambda value: value.update(schemaVersion="parsed-cv/0.9"),
    lambda value: value["document"].update(cvVersionId="d1e9d7cb-15d0-4bc7-b6e4-bf5ce3e8ea89"),
    lambda value: value.pop("summary"),
])
def test_user_payload_rejects_inconsistent_payload(mutation) -> None:
    value = copy.deepcopy(payload())
    mutation(value)

    with pytest.raises(ApiContractError):
        _validate_user_payload(CV_VERSION_ID, value)


def test_update_requires_the_latest_owned_revision_id() -> None:
    with pytest.raises(ValidationError):
        UpdateParsedCvRequest.model_validate({
            "cvId": str(uuid4()),
            "payload": payload(),
        })


def test_confirmation_rejects_a_stale_revision() -> None:
    latest_id = uuid4()
    latest = ParsedCvRevisionRecord(
        id=7,
        public_id=latest_id,
        cv_version_id=CV_VERSION_ID,
        owner_user_id=uuid4(),
        revision_number=2,
        source_hash="a" * 64,
        payload=payload(),
        status="PARSED",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        version=0,
    )
    repository = ParsedCvRevisionRepository(_ScalarSession(latest))

    with pytest.raises(ValueError, match="stale"):
        repository.confirm(CV_VERSION_ID, latest.owner_user_id, uuid4(), latest.owner_user_id)


class _ScalarSession:
    def __init__(self, value) -> None:
        self.value = value

    def scalar(self, _statement):
        return self.value
