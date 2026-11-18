from identity_fixtures import legacy_id, new_id
from datetime import UTC, datetime
from copy import deepcopy

import pytest

from app.jd.api import _validate_user_payload, router
from app.jd.parser import parse_jd
from app.jd.repository import ParsedJdRevisionRecord, ParsedJdRevisionRepository


JOB_VERSION_ID = int(str(legacy_id('779494ac-c858-4570-a884-6e88423b8e2b')))
SOURCE_HASH = "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382"


def payload() -> dict:
    return parse_jd(
        str(JOB_VERSION_ID), SOURCE_HASH, "Backend Engineer",
        "Build APIs.", "Java and PostgreSQL are required.",
    )


@pytest.mark.parametrize("section,new_value", [("education", "doctorate"), ("languages", "ja")])
def test_edited_jd_metadata_cannot_reuse_parser_evidence(section, new_value):
    prior = parse_jd(str(JOB_VERSION_ID), SOURCE_HASH, "Backend Engineer", "Build services.",
                     "Bachelor degree required. English B2 required.")
    value = deepcopy(prior)
    value["requirements"][section][0]["normalizedValue"] = new_value
    validated = _validate_user_payload(JOB_VERSION_ID, SOURCE_HASH, value, prior)
    assert validated["requirements"][section][0]["evidenceIds"] == []


def test_new_jd_requirement_cannot_copy_an_existing_evidence_id():
    prior = parse_jd(str(JOB_VERSION_ID), SOURCE_HASH, "Backend Engineer", "Build services.",
                     "English B2 required.")
    value = deepcopy(prior)
    value["requirements"]["languages"].append({**prior["requirements"]["languages"][0],
                                               "raw": "Japanese N1 required.", "normalizedValue": "ja"})
    validated = _validate_user_payload(JOB_VERSION_ID, SOURCE_HASH, value, prior)
    assert validated["requirements"]["languages"][0]["evidenceIds"] == prior["requirements"]["languages"][0]["evidenceIds"]
    assert validated["requirements"]["languages"][1]["evidenceIds"] == []


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
        str(legacy_id('d4f49f3b-a28e-5fd3-b558-94beba4054c0'))
    assert validated["requirements"]["preferredSkills"][1]["normalizationStatus"] == "PENDING"
    assert validated["requirements"]["preferredSkills"][1]["canonicalSkillId"] is None
    assert validated["requirements"]["preferredSkills"][0]["confirmedByRecruiter"] is True
    assert validated["requirements"]["preferredSkills"][1]["confirmedByRecruiter"] is False


def test_public_parsed_jd_api_does_not_accept_raw_jd_upserts() -> None:
    methods = {
        method
        for route in router.routes
        if route.path == "/api/v2/parsed-jds/{job_version_id}"
        for method in route.methods
    }

    assert methods == {"GET", "PATCH"}


def test_confirmation_rejects_a_stale_revision() -> None:
    latest_id = new_id()
    owner_id = new_id()
    latest = ParsedJdRevisionRecord(
        id=latest_id,
        job_id=new_id(),
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
        repository.confirm(JOB_VERSION_ID, owner_id, new_id(), owner_id)


def test_confirmation_and_supersede_respect_timestamp_constraint_under_clock_rollback() -> None:
    from sqlalchemy import CheckConstraint, MetaData, create_engine
    from sqlalchemy.orm import Session
    from app.jd.repository import ParsedJdHeadRecord

    engine = create_engine("sqlite://")
    metadata = MetaData()
    rev_table = ParsedJdRevisionRecord.__table__.to_metadata(metadata)
    rev_table.append_constraint(CheckConstraint("updated_at >= created_at", name="ck_parsed_jd_revisions_timestamps"))
    ParsedJdHeadRecord.__table__.to_metadata(metadata)
    metadata.create_all(engine)
    future = datetime(2100, 1, 2, 9)
    owner = new_id()
    job_id = new_id()
    try:
        with Session(engine) as session:
            rev1 = ParsedJdRevisionRecord(
                id=1, job_id=job_id, job_version_id=JOB_VERSION_ID, owner_user_id=owner,
                revision_number=1, source_hash=SOURCE_HASH, payload=payload(),
                status="PARSED", created_at=future, updated_at=future, version=0,
            )
            session.add(rev1)
            session.commit()
            confirmed1 = ParsedJdRevisionRepository(session).confirm(JOB_VERSION_ID, owner, rev1.id, owner)
            session.commit()
            assert confirmed1.confirmed_at is not None
            assert confirmed1.confirmed_at.astimezone(UTC) >= future.astimezone(UTC)
            rev2 = ParsedJdRevisionRecord(
                id=2, job_id=job_id, job_version_id=JOB_VERSION_ID, owner_user_id=owner,
                revision_number=2, source_hash="b" * 64, payload=payload(),
                status="PARSED", created_at=future, updated_at=future, version=0,
            )
            session.add(rev2)
            session.commit()
            confirmed2 = ParsedJdRevisionRepository(session).confirm(JOB_VERSION_ID, owner, rev2.id, owner)
            session.commit()
            assert confirmed2.confirmed_at is not None
            assert confirmed2.confirmed_at.astimezone(UTC) >= future.astimezone(UTC)
    finally:
        engine.dispose()


def test_colleague_handoff_can_read_edit_and_confirm_when_core_grants_access() -> None:
    from sqlalchemy import MetaData, create_engine
    from sqlalchemy.orm import Session
    from app.jd.repository import ParsedJdHeadRecord

    engine = create_engine("sqlite://")
    metadata = MetaData()
    ParsedJdRevisionRecord.__table__.to_metadata(metadata)
    ParsedJdHeadRecord.__table__.to_metadata(metadata)
    metadata.create_all(engine)
    creator = new_id()
    colleague = new_id()
    job_id = new_id()
    now = datetime.now(UTC)
    try:
        with Session(engine) as session:
            rev1 = ParsedJdRevisionRecord(
                id=1, job_id=job_id, job_version_id=JOB_VERSION_ID, owner_user_id=creator,
                revision_number=1, source_hash=SOURCE_HASH, payload=payload(),
                status="PARSED", created_at=now, updated_at=now, version=0,
            )
            session.add(rev1)
            session.commit()
            repo = ParsedJdRevisionRepository(session)
            assert repo.find_by_version(JOB_VERSION_ID) is not None
            rev2 = repo.create_revision(
                job_id=job_id, job_version_id=JOB_VERSION_ID, owner_user_id=colleague,
                source_hash=SOURCE_HASH, payload=payload(), expected_revision_id=rev1.id,
                enforce_owner=False,
            )
            confirmed = repo.confirm(
                job_version_id=JOB_VERSION_ID, owner_user_id=colleague,
                expected_revision_id=rev2.id, confirmed_by=colleague,
                enforce_owner=False,
            )
            session.commit()
            assert confirmed.status == "CONFIRMED"
            assert confirmed.confirmed_by == colleague
    finally:
        engine.dispose()


def test_verify_jd_recruit_access_rejects_former_member_when_core_returns_404(monkeypatch) -> None:
    from types import SimpleNamespace
    from urllib.error import HTTPError
    from fastapi import Request
    from app.jd.api import verify_jd_recruit_access
    from app.shared.api import ApiContractError
    from app.shared.config import Settings

    class _RejectingOpener:
        def open(self, *_args, **_kwargs):
            raise HTTPError("http://core-service:8082", 404, "Not Found", {}, None)

    monkeypatch.setattr("app.jd.api.build_opener", lambda *_args: _RejectingOpener())
    fake_request = Request({"type": "http", "headers": [(b"authorization", b"Bearer token")], "state": {}})
    fake_principal = SimpleNamespace(subject=new_id(), roles=["RECRUITER"])
    settings = Settings(db_url="sqlite://", auth_jwks_uri="http://auth/jwks", auth_jwt_issuer="iss", auth_jwt_audience="aud")
    with pytest.raises(ApiContractError) as exc:
        verify_jd_recruit_access(JOB_VERSION_ID, fake_request, fake_principal, settings)
    assert exc.value.status_code == 404


class _ScalarSession:
    def __init__(self, value) -> None:
        self.value = value

    def scalar(self, _statement):
        return self.value
