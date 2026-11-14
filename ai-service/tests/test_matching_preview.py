from identity_fixtures import new_id
from datetime import UTC, datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.cv.repository import ParsedCvRevisionRecord, ParsedCvHeadRecord
from app.jd.repository import ParsedJdRevisionRecord, ParsedJdHeadRecord
from app.matching.api import router
from app.shared.api import install_api_conventions
from app.shared.database import Base, get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token


@pytest.fixture
def test_setup():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    actor_id = new_id()
    cv_version_id = new_id()
    job_version_id = new_id()

    with session_factory() as session:
        # Seed confirmed CV revision owned by actor_id
        cv_rec = ParsedCvRevisionRecord(
            id=new_id(),
            cv_version_id=cv_version_id,
            owner_user_id=actor_id,
            revision_number=1,
            source_hash="sha256cv",
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
            payload={
                "document": {"taxonomyVersion": "1.0.0"},
                "skills": [
                    {"raw": "Java", "canonicalSkillId": "s-java", "normalizationStatus": "KNOWN", "evidenceIds": ["e1"], "confidence": 0.9, "provenance": "EXTRACTED"},
                    {"raw": "Spring Boot", "canonicalSkillId": "s-spring", "normalizationStatus": "KNOWN", "evidenceIds": ["e2"], "confidence": 0.9, "provenance": "EXTRACTED"},
                ],
                "experiences": [
                    {
                        "titleRaw": "Backend Developer",
                        "titleCanonical": "backend-developer",
                        "startMonth": "2023-01",
                        "endMonth": "2025-01",
                        "isCurrent": False,
                        "responsibilities": ["Develop microservices in Java"],
                        "skillIds": ["s-java", "s-spring"],
                        "evidenceIds": ["e1"],
                        "confidence": 0.8,
                    }
                ],
                "summary": {"totalExperienceMonths": 24, "overallConfidence": 0.9, "qualityFlags": []},
            },
            status="CONFIRMED",
            version=1,
        )
        session.add(cv_rec)
        session.flush()

        cv_head = ParsedCvHeadRecord(
            cv_version_id=cv_version_id,
            revision_id=cv_rec.id,
            confirmed_by=actor_id,
            confirmed_at=datetime.now(UTC),
            version=1,
        )
        session.add(cv_head)

        # Seed confirmed JD revision
        jd_rec = ParsedJdRevisionRecord(
            id=new_id(),
            job_id=new_id(),
            job_version_id=job_version_id,
            owner_user_id=new_id(),
            revision_number=1,
            source_hash="sha256jd",
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
            payload={
                "document": {"jobVersionId": str(job_version_id), "taxonomyVersion": "1.0.0"},
                "title": {"raw": "Senior Backend Engineer", "canonicalFamily": "backend-developer", "level": "senior", "confidence": 0.9, "evidenceIds": []},
                "requirements": {
                    "requiredSkills": [
                        {"raw": "Java", "canonicalSkillId": "s-java", "normalizationStatus": "KNOWN", "criticality": "CRITICAL", "minimumMonths": 12, "evidenceIds": [], "confidence": 0.9, "confirmedByRecruiter": True},
                        {"raw": "Kafka", "canonicalSkillId": "s-kafka", "normalizationStatus": "KNOWN", "criticality": "CRITICAL", "minimumMonths": 12, "evidenceIds": [], "confidence": 0.9, "confirmedByRecruiter": True},
                    ],
                    "preferredSkills": [],
                    "minimumRelevantExperienceMonths": 24,
                    "education": [],
                    "languages": [],
                },
                "responsibilities": [],
                "overallConfidence": 0.9,
                "qualityFlags": [],
            },
            status="CONFIRMED",
            confirmed_by=new_id(),
            version=1,
        )
        session.add(jd_rec)
        session.flush()

        jd_head = ParsedJdHeadRecord(
            job_version_id=job_version_id,
            revision_id=jd_rec.id,
            confirmed_by=new_id(),
            confirmed_at=datetime.now(UTC),
            version=1,
        )
        session.add(jd_head)
        session.commit()

    app = FastAPI()
    install_api_conventions(app)
    app.include_router(router)

    def override_session():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(actor_id, ("CANDIDATE",))

    return TestClient(app), actor_id, cv_version_id, job_version_id


def test_matching_preview_returns_score_and_summary(test_setup):
    client, actor_id, cv_version_id, job_version_id = test_setup

    resp = client.post(
        "/api/v2/matching-requests/preview",
        json={"cvVersionId": str(cv_version_id), "jobVersionId": str(job_version_id)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "finalScore" in data
    assert data["cvVersionId"] == str(cv_version_id)
    assert data["jobVersionId"] == str(job_version_id)
    assert data["status"] in ("COMPLETED", "DEGRADED", "INSUFFICIENT_DATA")

    summary = data["summary"]
    assert "matchLevel" in summary
    assert "headline" in summary
    assert "advice" in summary
    assert "supportedSkills" in summary
    assert "missingSkills" in summary
    assert "Java" in summary["supportedSkills"] or "s-java" in summary["supportedSkills"]
    assert "Kafka" in summary["missingSkills"] or "s-kafka" in summary["missingSkills"]


def test_matching_preview_rejects_unowned_cv(test_setup):
    client, actor_id, cv_version_id, job_version_id = test_setup
    unowned_cv_id = new_id()

    resp = client.post(
        "/api/v2/matching-requests/preview",
        json={"cvVersionId": str(unowned_cv_id), "jobVersionId": str(job_version_id)},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "CV_NOT_FOUND"


def test_matching_preview_counts_uncertain_required_skills(test_setup, monkeypatch):
    from dataclasses import replace

    client, _, cv_version_id, job_version_id = test_setup
    from app.matching import api

    original = api.compute_match

    def compute(*args, **kwargs):
        result = original(*args, **kwargs)
        return replace(result, claims=[
            {"type": "SUPPORTED", "label": "Java"},
            {"type": "UNCERTAIN", "label": "Kafka"},
            {"type": "MISSING", "label": "Docker"},
        ])

    monkeypatch.setattr(api, "compute_match", compute)
    response = client.post("/api/v2/matching-requests/preview", json={
        "cvVersionId": str(cv_version_id), "jobVersionId": str(job_version_id),
    })
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["totalRequiredSkills"] == 3
    assert summary["matchedRequiredSkills"] == 1
    assert summary["missingSkills"] == ["Docker"]
    assert summary["uncertainSkills"] == ["Kafka"]
    assert response.json()["explanation"]["claims"][1]["type"] == "UNCERTAIN"


@pytest.mark.parametrize("confirmed_owner", [None, "other"])
def test_matching_preview_requires_the_users_confirmed_cv_revision(test_setup, monkeypatch, confirmed_owner):
    from dataclasses import replace
    from app.cv.repository import ParsedCvRevisionRepository

    client, _, cv_version_id, job_version_id = test_setup
    original = ParsedCvRevisionRepository.find_confirmed

    def find_confirmed(self, version_id):
        revision = original(self, version_id)
        return None if confirmed_owner is None else replace(revision, owner_user_id=new_id())

    monkeypatch.setattr(ParsedCvRevisionRepository, "find_confirmed", find_confirmed)
    response = client.post("/api/v2/matching-requests/preview", json={
        "cvVersionId": str(cv_version_id), "jobVersionId": str(job_version_id),
    })
    assert response.status_code == 409
    assert response.json()["code"] == "CV_NOT_CONFIRMED"


def test_matching_preview_without_required_skills_uses_cautious_headline(test_setup, monkeypatch):
    from dataclasses import replace

    client, _, cv_version_id, job_version_id = test_setup
    from app.matching import api

    original = api.compute_match

    def compute(*args, **kwargs):
        return replace(original(*args, **kwargs), final_score=100.0, status="DEGRADED",
                       quality_flags=["NO_REQUIRED_SKILLS"], claims=[])

    monkeypatch.setattr(api, "compute_match", compute)
    response = client.post("/api/v2/matching-requests/preview", json={
        "cvVersionId": str(cv_version_id), "jobVersionId": str(job_version_id),
    })
    summary = response.json()["summary"]
    assert summary["matchLevel"] == "EXCELLENT"
    assert "chỉ mang tính tham khảo" in summary["headline"]


def test_matching_preview_rejects_nonexistent_jd(test_setup):
    client, actor_id, cv_version_id, job_version_id = test_setup
    unknown_job_id = new_id()

    resp = client.post(
        "/api/v2/matching-requests/preview",
        json={"cvVersionId": str(cv_version_id), "jobVersionId": str(unknown_job_id)},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "JD_NOT_FOUND"
