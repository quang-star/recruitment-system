from identity_fixtures import new_id
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.shared.api import install_api_conventions
from app.shared.database import get_session
from app.shared.security import require_access_token
from app.taxonomy.api import router
from app.taxonomy.occurrences import SkillSourceOccurrence, SkillOccurrenceRevision
from app.taxonomy.catalog import (SkillCatalogRecord, SkillCatalogHistory, seed_skills, change,
                                  snapshot, propose_from_jd, head, TaxonomyVersionRecord, publish_version)
from app.taxonomy.normalizer import normalize_skill, use_taxonomy
from app.taxonomy.api import require_admin
from app.shared.security import AuthenticatedPrincipal
from app.shared.api import ApiContractError


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SkillCatalogRecord.__table__.create(engine)
    SkillCatalogHistory.__table__.create(engine)
    TaxonomyVersionRecord.__table__.create(engine)
    SkillSourceOccurrence.__table__.create(engine)
    SkillOccurrenceRevision.__table__.create(engine)
    with Session(engine) as value:
        value.add(SkillCatalogRecord(id=1, version=0, skills=seed_skills()))
        value.commit()
        yield value
    engine.dispose()


def test_approval_alias_merge_are_versioned_and_old_snapshot_is_unchanged(session):
    actor = new_id()
    before = snapshot(session)
    created = change(session, actor, 0, action="PROPOSE", name="NewFrameworkX", reason="Synthetic JD skill")
    skill_id = int(created["skill"]["stableId"])
    with use_taxonomy(snapshot(session)):
        assert normalize_skill("NewFrameworkX") is None
    change(session, actor, 1, action="APPROVE", skill_id=skill_id, aliases=["NFX"], reason="Verified new framework")
    approved = snapshot(session)
    with use_taxonomy(approved):
        assert normalize_skill("NFX").stable_id == str(skill_id)
    target = change(session, actor, 2, action="CREATE", name="CanonicalFramework", reason="Create target")
    change(session, actor, 3, action="MERGE", skill_id=skill_id, merge_target_id=int(target["skill"]["stableId"]),
           reason="Same verified framework")
    with use_taxonomy(snapshot(session)):
        assert normalize_skill("NFX").stable_id == target["skill"]["stableId"]
    with use_taxonomy(approved):
        assert normalize_skill("NFX").stable_id == str(skill_id)
    with use_taxonomy(before):
        assert normalize_skill("NewFrameworkX") is None
    rows = session.scalars(select(SkillCatalogHistory)).all()
    assert len(rows) == 4
    assert rows[-1].after_state["target"]["canonicalName"] == "CanonicalFramework"


def test_conflicts_cannot_publish_or_silently_reuse_alias(session):
    actor = new_id()
    change(session, actor, 0, action="CREATE", name="UniqueX", reason="Create skill")
    with pytest.raises(ApiContractError):
        change(session, actor, 0, action="CREATE", name="OtherX", reason="Create skill")
    with pytest.raises(ApiContractError):
        change(session, actor, 1, action="CREATE", name="NewX", aliases=["Java"], reason="Create skill")
    assert head(session).version == 1


def test_job_proposals_are_deduplicated_and_rejected_name_does_not_reappear(session):
    actor = new_id()
    payload = {"requirements": {"requiredSkills": [{"raw": "NewX", "normalizationStatus": "PENDING"}]}}
    original = deepcopy(payload)
    propose_from_jd(session, actor, payload)
    propose_from_jd(session, actor, payload)
    value = head(session)
    assert value.version == 1
    skill = next(item for item in value.skills if item["canonicalName"] == "NewX")
    change(session, actor, 1, action="REJECT", skill_id=int(skill["stableId"]), reason="Not a skill in this context")
    propose_from_jd(session, actor, payload)
    assert head(session).version == 2
    assert payload == original  # Pending skill remains usable on its confirmed JD.


def test_catalog_requires_verified_admin_role():
    with pytest.raises(ApiContractError) as error:
        require_admin(AuthenticatedPrincipal(new_id(), ("RECRUITER",)))
    assert error.value.status_code == 403
    with pytest.raises(ApiContractError):
        require_admin(AuthenticatedPrincipal(new_id(), ("ADMIN",)))
    assert require_admin(AuthenticatedPrincipal(new_id(), ("SYSTEM_ADMIN",)))


def review(session, *, action="CREATE", **fields):
    return change(session, new_id(), head(session).version, action=action, reason="Synthetic review decision", **fields)


@pytest.mark.parametrize("reason", [None, "", " \n\t ", "x" * 1001])
def test_reason_is_required_before_any_catalog_write(session, reason):
    with pytest.raises(ApiContractError) as error:
        change(session, new_id(), 0, action="CREATE", name="NewX", reason=reason)
    assert error.value.code == "SKILL_REASON_REQUIRED"
    assert head(session).version == 0
    assert session.scalars(select(SkillCatalogHistory)).all() == []


def test_pending_review_decisions_keep_publication_unchanged_and_record_audit(session):
    before = snapshot(session)
    correlation = uuid4()
    created = review(session, action="PROPOSE", name="New Framework X", correlation_id=correlation)
    skill_id = int(created["skill"]["stableId"])
    edited = review(session, action="EDIT", skill_id=skill_id, skill_type="framework", category="backend")
    deferred = review(session, action="DEFER", skill_id=skill_id)
    assert deferred["skill"]["status"] == "DEFERRED"
    assert deferred["version"] == 3
    assert created["taxonomyVersion"] == edited["taxonomyVersion"] == deferred["taxonomyVersion"] == "1.0.0"
    with pytest.raises(ApiContractError) as error:
        review(session, name="new framework x")
    assert error.value.code == "SKILL_ALIAS_CONFLICT"
    reopened = review(session, action="REOPEN", skill_id=skill_id)
    assert reopened["skill"]["status"] == "PENDING"
    rejected = review(session, action="REJECT", skill_id=skill_id)
    assert rejected["taxonomyVersion"] == "1.0.0"
    assert snapshot(session) == before
    assert session.scalars(select(TaxonomyVersionRecord)).all() == []
    history = session.scalars(select(SkillCatalogHistory).order_by(SkillCatalogHistory.catalog_version)).all()
    assert [row.action for row in history] == ["PROPOSE", "EDIT", "DEFER", "REOPEN", "REJECT"]
    assert all(row.reason == "Synthetic review decision" for row in history)
    assert history[0].correlation_id == correlation


def test_legacy_publication_mapping_stays_fixed_until_an_active_definition_changes(session):
    skill = {"stableId": str(new_id()), "canonicalName": "Kỹ năng mới", "normalizedName": "kỹ năng mới",
             "type": "tool", "category": "other", "aliases": [], "relations": [], "status": "ACTIVE"}
    catalog = head(session)
    catalog.version = catalog.published_version = 4
    catalog.skills = [deepcopy(skill)]
    payload = {"semanticVersion": "1.0.4", "skills": [deepcopy(skill)]}
    session.add(TaxonomyVersionRecord(semantic_version="1.0.4", schema_version="skill-taxonomy/2.0", status="ACTIVE",
                                     language_scope=["vi", "en"], source_hash="a" * 64,
                                     created_at=datetime.now(UTC), payload=payload))
    session.commit()
    before = snapshot(session)
    proposed = review(session, action="PROPOSE", name="NewX")
    assert proposed["taxonomyVersion"] == "1.0.4" and snapshot(session) == before
    assert "ky-nang-moi" not in snapshot(session).by_alias
    published = review(session, name="OtherX")
    assert published["taxonomyVersion"] == "1.0.6"
    assert snapshot(session).by_alias["ky-nang-moi"][0] == skill["stableId"]
    assert session.get(TaxonomyVersionRecord, "1.0.4").payload == payload


def test_existing_publication_cannot_be_reused_for_another_definition(session):
    skills = seed_skills()
    publish_version(session, skills, 2)
    original = deepcopy(session.get(TaxonomyVersionRecord, "1.0.2").payload)
    publish_version(session, skills, 2)  # Identical publication remains idempotent.
    skills[0]["category"] = "cross_functional"
    with pytest.raises(ApiContractError) as error:
        publish_version(session, skills, 2)
    assert error.value.status_code == 409
    assert session.get(TaxonomyVersionRecord, "1.0.2").payload == original


def test_legacy_slug_collision_blocks_publication_without_changing_pending_review_or_old_mapping(session):
    first = {"stableId": str(new_id()), "canonicalName": "Foo Bar", "normalizedName": "foo bar",
             "type": "tool", "category": "other", "aliases": [], "relations": [], "status": "ACTIVE"}
    second = {**first, "stableId": str(new_id()), "canonicalName": "Foo-Bar", "normalizedName": "foo-bar"}
    catalog = head(session)
    catalog.version = catalog.published_version = 4
    catalog.skills = [first, second]
    old_payload = {"semanticVersion": "1.0.4", "skills": deepcopy(catalog.skills)}
    session.add(TaxonomyVersionRecord(semantic_version="1.0.4", schema_version="skill-taxonomy/2.0", status="ACTIVE",
                                     language_scope=["vi", "en"], source_hash="a" * 64,
                                     created_at=datetime.now(UTC), payload=old_payload))
    session.commit()
    old_mapping = snapshot(session)
    proposed = review(session, action="PROPOSE", name="OtherX")
    skill_id = int(proposed["skill"]["stableId"])
    review(session, action="DEFER", skill_id=skill_id)
    review(session, action="REOPEN", skill_id=skill_id)
    expected_version = head(session).version
    before = deepcopy(head(session).skills)
    with pytest.raises(ApiContractError) as error:
        review(session, action="APPROVE", skill_id=skill_id)
    assert error.value.code == "SKILL_ALIAS_CONFLICT"
    assert head(session).version == expected_version and head(session).skills == before
    assert snapshot(session) == old_mapping
    assert old_mapping.by_alias["foo bar"][0] != old_mapping.by_alias["foo-bar"][0]
    assert session.get(TaxonomyVersionRecord, "1.0.4").payload == old_payload
    assert session.get(TaxonomyVersionRecord, f"1.0.{expected_version + 1}") is None


@pytest.mark.parametrize("state,action", [("ACTIVE", "APPROVE"), ("ACTIVE", "DEFER"), ("ACTIVE", "REOPEN"),
                                         ("ACTIVE", "REJECT"), ("PENDING", "REOPEN"), ("DEFERRED", "DEFER"),
                                         ("DEFERRED", "APPROVE"), ("DEFERRED", "EDIT"), ("DEFERRED", "REJECT")])
def test_review_state_machine_rejects_invalid_transitions_without_writes(session, state, action):
    created = review(session, action="CREATE" if state == "ACTIVE" else "PROPOSE", name="SyntheticX")
    skill_id = int(created["skill"]["stableId"])
    if state == "DEFERRED":
        review(session, action="DEFER", skill_id=skill_id)
    before = deepcopy(head(session).skills)
    version = head(session).version
    with pytest.raises(ApiContractError) as error:
        review(session, action=action, skill_id=skill_id)
    assert error.value.status_code == 409
    assert head(session).version == version and head(session).skills == before


@pytest.mark.parametrize("name,slug", [("New Framework X", "new-framework-x"), ("Kỹ năng đặc biệt", "ky-nang-dac-biet"),
                                      ("C++", "c++"), (".NET Tool", "net-tool"), ("技能", None)])
def test_edit_and_approve_publishes_contract_valid_metadata_atomically(session, name, slug):
    created = review(session, action="PROPOSE", name="PlaceholderX")
    target = seed_skills()[0]["stableId"]
    result = review(session, action="APPROVE", skill_id=int(created["skill"]["stableId"]), name=name,
                    skill_type="framework", category="backend", aliases=["SyntheticAlias"],
                    relations=[{"type": "RELATED", "targetSkillId": target}])
    assert result["taxonomyVersion"] == "1.0.2"
    if slug is None:
        assert result["skill"]["normalizedName"].startswith("skill-")
    else:
        assert result["skill"]["normalizedName"] == slug
    version = session.get(TaxonomyVersionRecord, "1.0.2")
    assert version.payload["status"] == "PUBLISHED"
    assert version.payload["skills"][-1]["type"] == "framework"
    assert version.payload["skills"][-1]["relations"] == [{"type": "RELATED", "targetSkillId": target}]
    with use_taxonomy(snapshot(session)):
        assert normalize_skill(name).stable_id == result["skill"]["stableId"]
        assert normalize_skill("SyntheticAlias").stable_id == result["skill"]["stableId"]


@pytest.mark.parametrize("kind", ["BROADER", "NARROWER", "SUPERSEDES"])
def test_directed_relations_reject_cycles_but_related_cycles_are_allowed(session, kind):
    first = review(session, name="FirstX")["skill"]["stableId"]
    second = review(session, name="SecondX", relations=[{"type": kind, "targetSkillId": first}])["skill"]["stableId"]
    version = head(session).version
    with pytest.raises(ApiContractError) as error:
        review(session, action="EDIT", skill_id=int(first), relations=[{"type": kind, "targetSkillId": second}])
    assert error.value.code == "SKILL_RELATION_CYCLE"
    assert head(session).version == version
    review(session, action="EDIT", skill_id=int(first), relations=[{"type": "RELATED", "targetSkillId": second}])
    review(session, action="EDIT", skill_id=int(second), relations=[{"type": "RELATED", "targetSkillId": first}])


def test_opposite_hierarchy_types_use_one_direction_and_do_not_create_a_false_cycle(session):
    first = review(session, name="BroadX")["skill"]["stableId"]
    second = review(session, name="NarrowX", relations=[{"type": "NARROWER", "targetSkillId": first}])["skill"]["stableId"]
    review(session, action="EDIT", skill_id=int(first), relations=[{"type": "BROADER", "targetSkillId": second}])


@pytest.mark.parametrize("case", ["self", "missing", "pending", "duplicate", "wrong-type"])
def test_invalid_relation_target_and_duplicate_do_not_write(session, case):
    entry = review(session, name="TargetX")["skill"]["stableId"]
    pending = review(session, action="PROPOSE", name="PendingX")["skill"]["stableId"]
    target = entry if case == "self" else seed_skills()[0]["stableId"] if case in ("duplicate", "wrong-type") else pending if case == "pending" else str(new_id())
    relations = [{"type": "UNKNOWN" if case == "wrong-type" else "RELATED", "targetSkillId": target}]
    if case == "duplicate":
        relations *= 2
    version = head(session).version
    with pytest.raises(ApiContractError) as error:
        review(session, action="EDIT", skill_id=int(entry), relations=relations)
    assert error.value.code == "SKILL_RELATION_INVALID"
    assert head(session).version == version


def test_merge_redirects_incoming_relations_transfers_outgoing_and_audits_all_changes(session):
    target = review(session, name="MergeTargetX")["skill"]["stableId"]
    other = review(session, name="RelatedX")["skill"]["stableId"]
    source = review(session, name="MergeSourceX", aliases=["SourceAlias"],
                    relations=[{"type": "RELATED", "targetSkillId": other}])["skill"]["stableId"]
    inbound = review(session, name="InboundX", relations=[{"type": "RELATED", "targetSkillId": source}])["skill"]["stableId"]
    old = snapshot(session)
    result = review(session, action="MERGE", skill_id=int(source), merge_target_id=int(target))
    current = {skill["stableId"]: skill for skill in head(session).skills}
    assert current[inbound]["relations"] == [{"type": "RELATED", "targetSkillId": target}]
    assert current[target]["relations"] == [{"type": "RELATED", "targetSkillId": other}]
    assert old.version != result["taxonomyVersion"]
    assert old.by_alias["mergesourcex"][0] == source
    history = session.scalar(select(SkillCatalogHistory).where(SkillCatalogHistory.action == "MERGE"))
    assert history.before_state["target"]["aliases"] == []
    assert history.after_state["target"]["aliases"][-1]["value"] == "MergeSourceX"
    assert history.after_state["relationChanges"][0]["before"]["stableId"] == inbound
    assert history.after_state["relationChanges"][0]["after"]["relations"][0]["targetSkillId"] == target


def test_merge_cannot_create_a_hierarchy_cycle_or_publish_partial_changes(session):
    target = review(session, name="TopX")["skill"]["stableId"]
    middle = review(session, name="MiddleX", relations=[{"type": "BROADER", "targetSkillId": target}])["skill"]["stableId"]
    source = review(session, name="BottomX", relations=[{"type": "BROADER", "targetSkillId": middle}])["skill"]["stableId"]
    version = head(session).version
    before = deepcopy(head(session).skills)
    with pytest.raises(ApiContractError) as error:
        review(session, action="MERGE", skill_id=int(source), merge_target_id=int(target))
    assert error.value.code == "SKILL_RELATION_CYCLE"
    assert head(session).version == version and head(session).skills == before


def test_api_validates_reason_metadata_and_exposes_correlation_without_touching_auth(session):
    app = FastAPI()
    install_api_conventions(app)
    app.include_router(router)
    actor = new_id()
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(actor, ("SYSTEM_ADMIN",))
    app.dependency_overrides[get_session] = lambda: session
    correlation = str(uuid4())
    with TestClient(app) as client:
        for reason in (None, "", " \n "):
            body = {"version": 0, "action": "CREATE", "name": "API Skill"}
            if reason is not None:
                body["reason"] = reason
            assert client.post("/api/v2/taxonomy/skills", json=body).status_code == 422
        bad = client.post("/api/v2/taxonomy/skills", json={"version": 0, "action": "CREATE", "name": "API Skill",
                                                         "reason": "Valid reason", "type": "tool"})
        assert bad.status_code == 422
        response = client.post("/api/v2/taxonomy/skills", headers={"X-Correlation-Id": correlation},
                               json={"version": 0, "action": "CREATE", "name": "API Skill", "reason": "  Verified source  ",
                                     "type": "framework", "category": "backend", "relations": []})
        assert response.status_code == 200
        skill_id = response.json()["skill"]["stableId"]
        history = client.get(f"/api/v2/taxonomy/skills/{skill_id}/history").json()
        assert history[0]["actorId"] == str(actor) and history[0]["reason"] == "Verified source"
        assert history[0]["correlationId"] == correlation
        assert client.get("/api/v2/taxonomy/skills").json()["taxonomyVersion"] == "1.0.1"
        app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(actor, ("RECRUITER",))
        assert client.get("/api/v2/taxonomy/skills").status_code == 403
        assert client.post("/api/v2/taxonomy/skills", json={"version": 1, "action": "CREATE", "name": "OtherX",
                                                         "reason": "Verified source"}).status_code == 403
