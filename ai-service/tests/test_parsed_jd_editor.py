from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.jd.api import _validate_user_payload, router
from app.jd.parser import parse_jd
from app.jd.repository import ParsedJdRevisionRecord, ParsedJdRevisionRepository


JOB_VERSION_ID = UUID("779494ac-c858-4570-a884-6e88423b8e2b")
SOURCE_HASH = "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382"


def payload() -> dict:
    return parse_jd(
        str(JOB_VERSION_ID), SOURCE_HASH, "Backend Engineer",
        "Build APIs.", "Java and PostgreSQL are required.",
    )


def test_recruiter_edit_normalizes_known_and_preserves_unknown_skill() -> None:
    value = payload()
    value["requirements"]["preferredSkills"] = [
        {
            "raw": "ReactJS", "canonicalSkillId": None, "normalizationStatus": "UNRESOLVED",
            "criticality": "NORMAL", "minimumMonths": None, "evidenceIds": [],
            "confidence": 1, "confirmedByRecruiter": False,
        },
        {
            "raw": "InternalPlatformX", "canonicalSkillId": None,
            "normalizationStatus": "UNRESOLVED", "criticality": "NORMAL",
            "minimumMonths": None, "evidenceIds": [], "confidence": 1,
            "confirmedByRecruiter": False,
        },
    ]

    validated = _validate_user_payload(JOB_VERSION_ID, SOURCE_HASH, value)

    assert validated["requirements"]["preferredSkills"][0]["normalizationStatus"] == "KNOWN"
    assert validated["requirements"]["preferredSkills"][0]["canonicalSkillId"] == \
        "d4f49f3b-a28e-5fd3-b558-94beba4054c0"
    assert validated["requirements"]["preferredSkills"][1]["normalizationStatus"] == "PENDING"
    assert validated["requirements"]["preferredSkills"][1]["canonicalSkillId"] is None
    assert all(skill["confirmedByRecruiter"] for skill in validated["requirements"]["preferredSkills"])


def test_public_parsed_jd_api_does_not_accept_raw_jd_upserts() -> None:
    methods = {
        method
        for route in router.routes
        if route.path == "/api/v1/parsed-jds/{job_version_id}"
        for method in route.methods
    }

    assert methods == {"GET", "PATCH"}


def test_confirmation_rejects_a_stale_revision() -> None:
    latest_id = uuid4()
    owner_id = uuid4()
    latest = ParsedJdRevisionRecord(
        id=9,
        public_id=latest_id,
        job_id=uuid4(),
        job_version_id=JOB_VERSION_ID,
        owner_user_id=owner_id,
        revision_number=2,
        source_hash=SOURCE_HASH,
        payload=payload(),
        status="PARSED",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        confirmed_by=None,
        confirmed_at=None,
        version=0,
    )
    repository = ParsedJdRevisionRepository(_ScalarSession(latest))

    with pytest.raises(ValueError, match="stale"):
        repository.confirm(JOB_VERSION_ID, owner_id, uuid4(), owner_id)


class _ScalarSession:
    def __init__(self, value) -> None:
        self.value = value

    def scalar(self, _statement):
        return self.value
