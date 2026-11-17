from identity_fixtures import new_id
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.shared.api import install_api_conventions
from app.shared.config import Settings, get_settings
from app.shared.database import get_session
from app.shared.privacy import PrivacyTombstone
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.api import router
from app.taxonomy.catalog import SkillCatalogHistory, SkillCatalogRecord, TaxonomyVersionRecord, seed_skills
from app.taxonomy.occurrences import SkillSourceOccurrence


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for model in (SkillCatalogHistory, SkillCatalogRecord, TaxonomyVersionRecord, SkillSourceOccurrence, PrivacyTombstone):
        model.__table__.create(engine)
    actor, skill, correlation = new_id(), new_id(), uuid4()
    with Session(engine) as session:
        session.add(SkillCatalogRecord(id=1, version=1, published_version=0, skills=[*seed_skills(), {
            "stableId": str(skill), "canonicalName": "React.jss", "normalizedName": "react.jss", "status": "PENDING",
            "type": "other", "category": "cross_functional", "aliases": [], "relations": []}]))
        session.add(SkillCatalogHistory(id=new_id(), skill_id=skill, actor_id=actor, action="PROPOSE", catalog_version=1,
                    before_state=None, after_state={"canonicalName": "React.jss"}, created_at=datetime(2026, 10, 2, tzinfo=UTC),
                    reason="Synthetic observed term", correlation_id=correlation))
        session.commit()
        app = FastAPI()
        install_api_conventions(app)
        app.include_router(router)
        principal = AuthenticatedPrincipal(actor, ("SYSTEM_ADMIN",))
        app.dependency_overrides[require_access_token] = lambda: principal
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[get_settings] = lambda: Settings(
            db_url="sqlite://", auth_jwks_uri="https://synthetic.invalid/jwks",
            auth_jwt_issuer="synthetic", auth_jwt_audience="synthetic")
        with TestClient(app) as value:
            yield value, app, actor, skill, correlation
    engine.dispose()


def test_admin_candidate_ranking_uses_published_snapshot_and_explicit_model_fallback(client):
    api, _, _, skill, _ = client
    path = f"/api/v2/taxonomy/pending-skills/{skill}/candidates"
    result = api.get(path)
    assert result.status_code == 200
    body = result.json()
    assert body["taxonomyVersion"] == "1.0.0" and body["resolution"] == "UNRESOLVED" and body["requiresReview"]
    assert body["candidates"][0]["canonicalName"] == "React" and body["semanticStatus"] == "DISABLED"
    assert body["scorePolicy"] == "RANKING_ONLY_UNCALIBRATED" and body["rankingMethod"] == "FUZZY_RATIO"
    semantic = api.get(path, params={"semantic": "true"}).json()
    assert semantic["semanticStatus"] == "MODEL_UNAVAILABLE" and semantic["candidates"] == body["candidates"]
    assert api.get(path, params={"limit": 21}).status_code == 422
    assert api.get(f"/api/v2/taxonomy/pending-skills/{new_id()}/candidates").status_code == 404


def test_admin_audit_filters_and_metadata_are_service_owned_and_bounded(client):
    api, _, actor, skill, correlation = client
    response = api.get("/api/v2/taxonomy/skills/history", params={
        "actorId": str(actor), "resourceId": str(skill), "action": "PROPOSE", "correlationId": str(correlation),
        "from": "2026-10-02T07:00:00+07:00", "to": "2026-10-02T00:00:00Z", "size": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1 and body["page"] == 0 and body["size"] == 1
    assert body["items"][0]["resourceId"] == str(skill) and body["items"][0]["reason"] == "Synthetic observed term"
    assert not body["items"][0]["redacted"]
    assert api.get("/api/v2/taxonomy/skills/history", params={"resourceId": str(new_id())}).json()["total"] == 0
    assert api.get("/api/v2/taxonomy/skills/history", params={"size": 101}).status_code == 422
    assert api.get("/api/v2/taxonomy/skills/history", params={"action": "DELETE"}).status_code == 422
    assert api.get("/api/v2/taxonomy/skills/history", params={"from": "2026-10-03T00:00:00Z", "to": "2026-10-02T00:00:00Z"}).status_code == 422
    assert api.get("/api/v2/taxonomy/skills/history", params={"from": "2026-10-02T00:00:00"}).status_code == 422


def test_pending_detail_masks_legacy_contact_aliases_without_changing_catalog(client):
    api, app, _, skill, _ = client
    session = app.dependency_overrides[get_session]()
    catalog = session.get(SkillCatalogRecord, 1)
    stored = [dict(entry) for entry in catalog.skills]
    stored[-1]["aliases"] = [{"value": "ｃａｎｄｉｄａｔｅ＠ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ", "normalized": "candidate@synthetic.invalid"}]
    catalog.skills = stored
    session.commit()
    response = api.get(f"/api/v2/taxonomy/pending-skills/{skill}").json()
    assert response["skill"]["redacted"]
    assert "candidate@synthetic.invalid" not in str(response)
    assert "ｃａｎｄｉｄａｔｅ" not in str(response)
    assert session.get(SkillCatalogRecord, 1).skills == stored


@pytest.mark.parametrize("name", ["candidate@synthetic.invalid", "https://synthetic.invalid/private", "Phone: 0901234567", "Masked ███",
                                  "ｃａｎｄｉｄａｔｅ＠ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ", "ｈｔｔｐｓ：／／ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ／ｐｒｉｖａｔｅ"])
def test_new_contact_definitions_cannot_enter_catalog_through_admin_mutation(client, name):
    api, _, _, _, _ = client
    response = api.post("/api/v2/taxonomy/skills", json={"version": 1, "action": "CREATE", "name": name, "reason": "Synthetic private term rejection"})
    assert response.status_code == 422 and response.json()["code"] == "SKILL_NAME_INVALID"
    assert api.get("/api/v2/taxonomy/skills").json()["version"] == 1


@pytest.mark.parametrize("roles", [("CANDIDATE",), ("RECRUITER",)])
def test_private_admin_reads_reject_other_roles(client, roles):
    api, app, actor, skill, _ = client
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(actor, roles)
    for path in ("/api/v2/taxonomy/skills/history", f"/api/v2/taxonomy/pending-skills/{skill}/candidates"):
        response = api.get(path)
        assert response.status_code == 403 and response.json()["code"] == "ADMIN_ROLE_REQUIRED"
