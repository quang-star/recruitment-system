"""Occurrence identity, bounded Admin metadata and source erasure regression gates."""
from identity_fixtures import new_id
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
import json
import os
from threading import Event
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import Integer, MetaData, create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.cv.repository import ParsedCvRevisionRecord, ParsedCvRevisionRepository
from app.jd.repository import ParsedJdRevisionRecord, ParsedJdRevisionRepository
from app.matching.repository import MatchingResultRecord
from app.outbox import OutboxEvent
from app.shared.api import ApiContractError, install_api_conventions
from app.shared.database import Base, get_session
from app.shared.extraction_usage import ExtractionUsage
from app.shared.privacy import PrivacyTombstone, process_privacy_event
from app.shared.privacy import require_live_cv
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.api import router
from app.taxonomy.catalog import CATALOG_LIMIT, SkillCatalogRecord, TaxonomyVersionRecord, change, head, seed_skills, publish_version
from app.taxonomy.catalog import SkillCatalogHistory
from app.task.persistence import ProcessingTaskRecord
from app.taxonomy.occurrences import (SkillOccurrenceRevision, SkillSourceOccurrence, detail, queue,
                                     record_cv_revision, record_jd_revision, source_page)

BASE_TIME = datetime(2026, 10, 2, tzinfo=UTC)


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata = MetaData()
    privacy_tables = [MatchingResultRecord.__table__, ProcessingTaskRecord.__table__,
                      ExtractionUsage.__table__, OutboxEvent.__table__]
    for table in dict.fromkeys([*Base.metadata.sorted_tables, *privacy_tables]):
        copy = table.to_metadata(metadata)
        if "id" in copy.c and isinstance(copy.c.id.type, Integer):
            copy.c.id.type = Integer()
    metadata.create_all(engine)
    with Session(engine) as value:
        value.add(SkillCatalogRecord(id=1, version=0, skills=seed_skills()))
        value.commit()
        yield value
    engine.dispose()


def payload(kind, names=("NewFrameworkX",), *, evidence=True, group="requiredSkills", private=False):
    refs, skills = [], []
    for index, name in enumerate(names):
        identity = str(new_id())
        refs.append({"id": identity, "page": 1 if kind == "CV" else None, "start": index * 20, "end": index * 20 + len(name),
                     "rawText": "private@example.invalid", "objectRef": "private/original.pdf"})
        item = {"raw": name, "canonicalSkillId": None, "normalizationStatus": "PENDING", "confidence": 0.7,
                "evidenceIds": [identity] if evidence else []}
        if kind == "CV":
            item["provenance"] = "EXTRACTED" if evidence else "USER_ASSERTED"
        else:
            item.update(criticality="CRITICAL" if group == "requiredSkills" else "NORMAL", confirmedByRecruiter=False)
        skills.append(item)
    result = {"document": {"taxonomyVersion": "1.0.0", "parserVersion": "synthetic-rules-v1"}, "evidence": refs}
    if kind == "CV":
        result["skills"] = skills
    else:
        result["requirements"] = {"requiredSkills": skills if group == "requiredSkills" else [],
                                  "preferredSkills": skills if group == "preferredSkills" else []}
    if private:
        result.update(summary={"name": "Private Person", "contact": "private@example.invalid"},
                      experiences=[{"company": "Private Employer", "raw": "Private personal details"}])
    return result


def store(session, kind, data, *, previous=None, version=None, at=BASE_TIME):
    version = version or (previous.cv_version_id if kind == "CV" and previous else
                          previous.job_version_id if previous else new_id())
    owner = previous.owner_user_id if previous else new_id()
    if kind == "CV":
        repository = ParsedCvRevisionRepository(session)
        revision = (repository.create_revision(version, owner, "a" * 64, data, previous.id)
                    if previous else repository.create(version, owner, "a" * 64, data))
        record = session.scalar(select(ParsedCvRevisionRecord).where(ParsedCvRevisionRecord.id == revision.id))
        writer = record_cv_revision
    else:
        repository = ParsedJdRevisionRepository(session)
        revision = (repository.create_revision(previous.job_id, version, owner, "a" * 64, data, previous.id)
                    if previous else repository.upsert(new_id(), version, owner, "a" * 64, data))
        record = session.scalar(select(ParsedJdRevisionRecord).where(ParsedJdRevisionRecord.id == revision.id))
        writer = record_jd_revision
    record.created_at = at
    session.flush()
    writer(session, revision, correlation_id=uuid4())
    session.commit()
    return revision


def entry(session, name):
    return next(skill for skill in head(session).skills if skill["canonicalName"] == name and skill["status"] != "REJECTED")


def rows(session):
    return session.scalars(select(SkillSourceOccurrence).order_by(SkillSourceOccurrence.field_role)).all()


def fill_catalog(session):
    catalog = head(session)
    definitions = deepcopy(catalog.skills)
    for index in range(len(definitions), CATALOG_LIMIT):
        definitions.append({"stableId": str(new_id()), "canonicalName": f"ReservedCapacity{index}",
                            "normalizedName": f"reserved-capacity-{index}", "status": "PENDING", "type": "other",
                            "category": "cross_functional", "aliases": [], "relations": []})
    catalog.skills = definitions
    session.commit()


@pytest.mark.parametrize("kind", ["CV", "JD"])
def test_catalog_capacity_keeps_source_review_confirmation_existing_and_known_observations(session, kind, caplog):
    publish_version(session, head(session).skills, 0)
    original_snapshot = deepcopy(session.get(TaxonomyVersionRecord, "1.0.0").payload)
    original = store(session, kind, payload(kind, names=("PreviouslyObservedX",)))
    known = next(skill for skill in head(session).skills if skill["status"] == "ACTIVE")
    fill_catalog(session)
    before_version = head(session).version
    data = payload(kind, names=("PreviouslyObservedX", "NewAtCapacityX", known["canonicalName"]))
    group = data["skills"] if kind == "CV" else data["requirements"]["requiredSkills"]
    group[-1].update(canonicalSkillId=known["stableId"], normalizationStatus="KNOWN")
    latest = store(session, kind, data, previous=original)
    writer = record_cv_revision if kind == "CV" else record_jd_revision
    result = writer(session, latest)
    assert result.recorded_count == 2 and result.skipped_catalog_limit_count == 1
    repository = ParsedCvRevisionRepository(session) if kind == "CV" else ParsedJdRevisionRepository(session)
    version = latest.cv_version_id if kind == "CV" else latest.job_version_id
    confirmed = repository.confirm(version, latest.owner_user_id, latest.id, latest.owner_user_id)
    confirmed_result = writer(session, confirmed)
    session.commit()
    expected_confirmed = deepcopy(data)
    if kind == "JD":
        for item in expected_confirmed["requirements"]["requiredSkills"]:
            item["confirmedByRecruiter"] = True
        assert all(not item["confirmedByRecruiter"] for item in data["requirements"]["requiredSkills"])
    assert confirmed.status == "CONFIRMED" and confirmed.payload == expected_confirmed
    assert confirmed_result.recorded_count == 2 and confirmed_result.skipped_catalog_limit_count == 1
    assert len(rows(session)) == 2 and all(row.active and row.latest_revision_id == latest.id for row in rows(session))
    assert all(row.safe_context["sourceConfirmed"] for row in rows(session))
    assert head(session).version == before_version and head(session).published_version == 0
    assert session.get(TaxonomyVersionRecord, "1.0.0").payload == original_snapshot
    assert not any(entry["canonicalName"] == "NewAtCapacityX" for entry in head(session).skills)
    capacity = queue(session, page=0, size=1, status="PENDING")["catalogCapacity"]
    assert capacity == {"limit": 1000, "used": 1000, "reached": True, "unmappedTermsMayBeSkipped": True}
    assert "SKILL_CATALOG_LIMIT" in caplog.text and "skipped=1" in caplog.text
    assert not any(value in caplog.text for value in ("PreviouslyObservedX", "NewAtCapacityX", str(latest.owner_user_id), str(version)))
    with pytest.raises(ApiContractError) as error:
        change(session, new_id(), before_version, action="CREATE", name="AdminNewAtCapacity", reason="Synthetic capacity test")
    assert error.value.code == "SKILL_CATALOG_LIMIT"


@pytest.mark.parametrize("code", ["SKILL_CATALOG_CONFLICT", "SKILL_ALIAS_CONFLICT"])
def test_recording_never_swallows_other_catalog_errors(session, monkeypatch, code):
    revision = ParsedCvRevisionRepository(session).create(new_id(), new_id(), "a" * 64, payload("CV"))
    session.commit()

    def unavailable(*args, **kwargs):
        raise ApiContractError(409, code, "Catalog unavailable")

    monkeypatch.setattr("app.taxonomy.occurrences.change", unavailable)
    with pytest.raises(ApiContractError) as error:
        record_cv_revision(session, revision)
    assert error.value.code == code
    session.rollback()


@pytest.mark.parametrize("kind", ["CV", "JD"])
def test_retry_review_and_confirmation_keep_one_occurrence_with_real_revision_links(session, kind):
    data = payload(kind)
    revision = store(session, kind, data)
    writer = record_cv_revision if kind == "CV" else record_jd_revision
    for _ in range(3):
        writer(session, revision, correlation_id=uuid4())
        session.commit()
    assert len(rows(session)) == 1
    assert session.scalar(select(func.count()).select_from(SkillOccurrenceRevision)) == 1
    edited = store(session, kind, deepcopy(data), previous=revision, at=BASE_TIME + timedelta(days=1))
    assert len(rows(session)) == 1 and rows(session)[0].latest_revision_id == edited.id
    repository = ParsedCvRevisionRepository(session) if kind == "CV" else ParsedJdRevisionRepository(session)
    version = edited.cv_version_id if kind == "CV" else edited.job_version_id
    confirmed = repository.confirm(version, edited.owner_user_id, edited.id, edited.owner_user_id)
    writer(session, confirmed)
    session.commit()
    assert session.scalar(select(func.count()).select_from(SkillOccurrenceRevision)) == 2
    item = rows(session)[0]
    assert item.first_revision_id == revision.id and item.latest_revision_id == edited.id
    assert item.first_seen.replace(tzinfo=UTC) == BASE_TIME and item.last_seen.replace(tzinfo=UTC) == BASE_TIME + timedelta(days=1)
    assert item.safe_context["sourceConfirmed"] is True
    assert detail(session, item.skill_id)["occurrenceCount"] == 1
    assert detail(session, item.skill_id)["sourceCount"] == 1


@pytest.mark.parametrize("kind", ["CV", "JD"])
def test_removed_term_and_late_older_revision_cannot_restore_queue_count(session, kind):
    original = store(session, kind, payload(kind))
    skill_id = int(entry(session, "NewFrameworkX")["stableId"])
    empty = payload(kind, names=())
    latest = store(session, kind, empty, previous=original, at=BASE_TIME + timedelta(days=1))
    writer = record_cv_revision if kind == "CV" else record_jd_revision
    writer(session, original)
    session.commit()
    assert detail(session, skill_id)["occurrenceCount"] == 0
    assert source_page(session, skill_id, page=0, size=20)["items"] == []
    assert rows(session)[0].active is False
    assert rows(session)[0].latest_revision_id == original.id
    assert latest.id != original.id


@pytest.mark.parametrize("kind", ["CV", "JD"])
def test_recorder_uses_persisted_payload_owner_and_status_even_when_handle_is_forged(session, kind):
    owner, version = new_id(), new_id()
    data = payload(kind, names=("ActualStoredX",))
    if kind == "CV":
        revision = ParsedCvRevisionRepository(session).create(version, owner, "a" * 64, data)
        writer = record_cv_revision
    else:
        revision = ParsedJdRevisionRepository(session).upsert(new_id(), version, owner, "a" * 64, data)
        writer = record_jd_revision
    session.commit()
    forged = replace(revision, owner_user_id=new_id(), status="CONFIRMED", payload=payload(kind, names=("ForgedX",)))
    writer(session, forged)
    session.commit()
    assert rows(session)[0].raw_term == "ActualStoredX"
    assert rows(session)[0].safe_context["sourceConfirmed"] is False
    assert rows(session)[0].evidence_refs[0]["id"] == data["evidence"][0]["id"]
    assert session.scalar(select(SkillCatalogHistory).where(SkillCatalogHistory.skill_id == rows(session)[0].skill_id)).actor_id == owner
    assert not any(skill["canonicalName"] == "ForgedX" for skill in head(session).skills)


def test_legacy_alias_normalized_term_maps_to_existing_skill_without_duplicate_proposal(session):
    catalog = head(session)
    definitions = deepcopy(catalog.skills)
    target_id = int(definitions[0]["stableId"])
    definitions[0]["aliases"].append({"value": "Legacy Display Alias", "normalized": "LegacyNormalizedX"})
    catalog.skills = definitions
    session.commit()
    store(session, "CV", payload("CV", names=("LegacyNormalizedX",)))
    assert rows(session)[0].skill_id == target_id
    assert head(session).version == 0


def test_move_between_jd_required_and_preferred_retires_prior_role_without_count_inflation(session):
    required = store(session, "JD", payload("JD"))
    preferred = store(session, "JD", payload("JD", group="preferredSkills"), previous=required)
    active = [row for row in rows(session) if row.active]
    assert len(rows(session)) == 2 and len(active) == 1
    assert active[0].field_role == "JD.preferredSkills" and active[0].latest_revision_id == preferred.id
    assert detail(session, active[0].skill_id)["occurrenceCount"] == 1


def test_cv_and_jd_sources_share_pending_term_but_keep_distinct_count_and_metadata(session):
    cv = store(session, "CV", payload("CV"))
    jd = store(session, "JD", payload("JD"))
    skill_id = int(entry(session, "NewFrameworkX")["stableId"])
    assert detail(session, skill_id)["occurrenceCount"] == detail(session, skill_id)["sourceCount"] == 2
    assert {row.latest_revision_id for row in rows(session)} == {cv.id, jd.id}
    assert queue(session, page=0, size=20, status="PENDING", source_kind="CV")["items"][0]["occurrenceCount"] == 1
    assert queue(session, page=0, size=20, status="PENDING", source_kind="JD")["items"][0]["sourceCount"] == 1
    assert head(session).published_version == 0


@pytest.mark.parametrize("term", ["private@example.invalid", "+84912345678", "https://private.invalid/cv", "Name: Private Person",
                                 "Họ và tên: Nguyễn Văn A", "line\nprivate", "masked█text",
                                 "ｐｒｉｖａｔｅ＠ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ", "ｈｔｔｐｓ：／／ｐｒｉｖａｔｅ．ｉｎｖａｌｉｄ／ｃｖ"])
def test_contact_or_private_term_is_kept_owner_private_and_not_proposed_or_recorded(session, term):
    data = payload("CV", names=(term,))
    revision = store(session, "CV", data)
    assert rows(session) == [] and head(session).version == 0
    assert revision.payload == data


@pytest.mark.parametrize("kind", ["CV", "JD"])
def test_normalization_expansion_beyond_column_bound_does_not_fail_source_or_confirm(session, kind):
    term = "ﬃ" * 100  # 100 raw characters normalize to 300, exceeding the DB bound.
    original = store(session, kind, payload(kind, names=(term,)))
    repository = ParsedCvRevisionRepository(session) if kind == "CV" else ParsedJdRevisionRepository(session)
    version = original.cv_version_id if kind == "CV" else original.job_version_id
    confirmed = repository.confirm(version, original.owner_user_id, original.id, original.owner_user_id)
    writer = record_cv_revision if kind == "CV" else record_jd_revision
    result = writer(session, confirmed)
    session.commit()
    latest = repository.find_owned(version, original.owner_user_id)
    assert latest.status == "CONFIRMED" and latest.id == original.id
    group = latest.payload["skills"] if kind == "CV" else latest.payload["requirements"]["requiredSkills"]
    assert group[0]["raw"] == term and group[0]["normalizationStatus"] == "PENDING"
    assert result.recorded_count == result.skipped_catalog_limit_count == 0
    assert rows(session) == [] and head(session).version == head(session).published_version == 0


def test_context_and_evidence_project_only_safe_metadata_with_no_private_source_fields(session):
    data = payload("CV", private=True)
    fake_id = str(new_id())
    data["skills"][0]["evidenceIds"].append(fake_id)
    revision = store(session, "CV", data)
    item = rows(session)[0]
    result = source_page(session, item.skill_id, page=0, size=20)
    serialized = json.dumps(result, default=str)
    assert not any(value in serialized for value in ("Private Person", "Private Employer", "private@example.invalid", "private/original.pdf", fake_id,
                                                       str(revision.owner_user_id), "sourceHash", "objectRef", "rawText", "downloadUrl"))
    assert set(result["items"][0]["evidenceRefs"][0]) == {"id", "page", "start", "end"}
    assert set(item.safe_context) == {"fieldRole", "provenance", "knownSkillIds", "sourceConfirmed"}
    assert result["items"][0]["firstRevisionId"] == revision.id


def test_user_assertion_has_no_invented_evidence_and_null_confidence_is_truthful(session):
    data = payload("CV", evidence=False)
    data["skills"][0]["confidence"] = None
    store(session, "CV", data)
    item = rows(session)[0]
    assert item.evidence_refs == [] and item.provenance == "USER_ASSERTED" and item.confidence is None


def test_queue_sql_pagination_sort_filters_and_empty_legacy_metadata(session):
    store(session, "CV", payload("CV", names=("FirstX",)), at=BASE_TIME)
    store(session, "JD", payload("JD", names=("SecondX",)), at=BASE_TIME + timedelta(days=2))
    store(session, "CV", payload("CV", names=("SecondX",)), at=BASE_TIME + timedelta(days=3))
    legacy = change(session, new_id(), head(session).version, action="PROPOSE", name="LegacyX", reason="Synthetic old proposal")
    session.commit()
    first = queue(session, page=0, size=1, status="PENDING")
    assert first["totalElements"] == 3 and first["items"][0]["name"] == "SecondX"
    assert first["items"][0]["occurrenceCount"] == 2
    second = queue(session, page=1, size=1, status="PENDING")
    assert second["items"][0]["name"] == "FirstX"
    assert queue(session, page=0, size=20, status="PENDING", sort="LAST_SEEN_DESC")["items"][0]["name"] == "SecondX"
    assert queue(session, page=0, size=20, status="PENDING", sort="FIRST_SEEN_ASC")["items"][0]["name"] == "FirstX"
    filtered = queue(session, page=0, size=20, status="PENDING", category="cross_functional", skill_type="other", q="second", source_kind="JD")
    assert filtered["totalElements"] == 1 and filtered["items"][0]["sourceCount"] == 1
    empty = detail(session, int(legacy["skill"]["stableId"]))
    assert empty["occurrenceCount"] == empty["sourceCount"] == 0 and empty["firstSeen"] is empty["lastSeen"] is None
    assert source_page(session, int(entry(session, "SecondX")["stableId"]), page=1, size=1)["totalElements"] == 2


def test_new_source_after_rejection_can_create_new_proposal_but_retry_preserves_prior_decision(session):
    original = store(session, "CV", payload("CV"))
    old_id = int(entry(session, "NewFrameworkX")["stableId"])
    change(session, new_id(), head(session).version, action="REJECT", skill_id=old_id, reason="Insufficient evidence in this source")
    session.commit()
    old_version = head(session).version
    record_cv_revision(session, original)
    session.commit()
    assert head(session).version == old_version and rows(session)[0].skill_id == old_id
    store(session, "JD", payload("JD"))
    proposed_id = int(entry(session, "NewFrameworkX")["stableId"])
    assert proposed_id != old_id
    assert detail(session, proposed_id)["sourceCount"] == 1


def test_merge_redirects_review_mapping_without_rewriting_observed_revision_payload(session):
    revision = store(session, "CV", payload("CV"))
    source = int(entry(session, "NewFrameworkX")["stableId"])
    target = change(session, new_id(), head(session).version, action="CREATE", name="CanonicalX", reason="Verified canonical skill")
    target_id = int(target["skill"]["stableId"])
    original = deepcopy(revision.payload)
    change(session, new_id(), head(session).version, action="MERGE", skill_id=source, merge_target_id=target_id, reason="Same skill")
    session.commit()
    record_cv_revision(session, revision)
    session.commit()
    assert rows(session)[0].skill_id == target_id
    assert session.get(SkillOccurrenceRevision, (rows(session)[0].id, revision.id)).observed_canonical_skill_id is None
    assert session.scalar(select(ParsedCvRevisionRecord).where(ParsedCvRevisionRecord.id == revision.id)).payload == original
    assert session.get(TaxonomyVersionRecord, target["taxonomyVersion"]).payload["skills"][-1]["canonicalName"] == "CanonicalX"


def test_cv_erasure_removes_ledger_links_and_fences_late_recording_but_keeps_other_source(session):
    cv = store(session, "CV", payload("CV"))
    store(session, "JD", payload("JD"))
    skill_id = int(entry(session, "NewFrameworkX")["stableId"])
    engine = session.get_bind()
    process_privacy_event({"eventType": "cv.deleted.v2", "payload": {"cvId": str(new_id()), "cvVersionId": str(cv.cv_version_id)}},
                          lambda: Session(engine))
    session.expire_all()
    assert detail(session, skill_id)["sourceCount"] == 1
    assert {row.source_kind for row in rows(session)} == {"JD"}
    assert session.scalar(select(func.count()).select_from(SkillOccurrenceRevision)) == 1
    with pytest.raises(ApiContractError) as error:
        record_cv_revision(session, cv)
    assert error.value.status_code == 410
    assert queue(session, page=0, size=20, status="PENDING", source_kind="CV")["items"] == []


def test_reader_excludes_tombstoned_sources_even_if_old_rows_remain(session):
    revision = store(session, "CV", payload("CV"))
    skill_id = rows(session)[0].skill_id
    session.add(PrivacyTombstone(kind="CV", resource_id=revision.cv_version_id, created_at=BASE_TIME))
    session.commit()
    assert detail(session, skill_id)["sourceCount"] == 0
    assert source_page(session, skill_id, page=0, size=20)["items"] == []


def test_admin_queue_and_source_routes_are_bounded_and_do_not_grant_raw_cv_access(session):
    revision = store(session, "CV", payload("CV"))
    skill_id = rows(session)[0].skill_id
    app = FastAPI()
    install_api_conventions(app)
    app.include_router(router)
    from app.cv.api import router as cv_router
    app.include_router(cv_router)
    roles = ["SYSTEM_ADMIN"]
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(new_id(), tuple(roles))
    with TestClient(app) as client:
        assert client.get("/api/v2/taxonomy/pending-skills?size=101").status_code == 422
        assert client.get("/api/v2/taxonomy/pending-skills?page=-1").status_code == 422
        assert client.get("/api/v2/taxonomy/pending-skills?page=100001").status_code == 422
        assert client.get("/api/v2/taxonomy/pending-skills?sort=UNKNOWN").status_code == 422
        response = client.get("/api/v2/taxonomy/pending-skills?sourceKind=CV&size=1")
        assert response.status_code == 200 and response.json()["totalElements"] == 1
        assert client.get(f"/api/v2/taxonomy/pending-skills/{skill_id}").json()["sourceCount"] == 1
        assert client.get(f"/api/v2/taxonomy/pending-skills/{skill_id}/occurrences").json()["items"][0]["sourceVersionId"] == str(revision.cv_version_id)
        assert client.get(f"/api/v2/taxonomy/pending-skills/{skill_id}/occurrences?page=100001").status_code == 422
        assert client.get(f"/api/v2/parsed-cvs/{revision.cv_version_id}").status_code == 403
        for role in ("CANDIDATE", "RECRUITER"):
            roles[:] = [role]
            assert client.get("/api/v2/taxonomy/pending-skills").status_code == 403
            assert client.get(f"/api/v2/taxonomy/pending-skills/{skill_id}/occurrences").status_code == 403


def test_postgresql_queue_and_cv_cleanup_serialize_against_source_recording():
    # The harness sets this only to its newly migrated, disposable QA database.
    url = os.getenv("WORKER_TEST_DB_URL")
    if not url:
        pytest.skip("isolated PostgreSQL harness required")
    engine = create_engine(url)
    term = "PgLedger" + uuid4().hex
    try:
        with Session(engine) as session:
            cv = store(session, "CV", payload("CV", names=(term,)))
            store(session, "JD", payload("JD", names=(term,)))
            skill_id = int(entry(session, term)["stableId"])
            result = queue(session, page=0, size=1, status="PENDING", q=term)
            assert result["totalElements"] == 1 and result["items"][0]["sourceCount"] == 2
            assert source_page(session, skill_id, page=1, size=1)["totalElements"] == 2
            assert queue(session, page=0, size=1, status="PENDING", q=term, source_kind="JD")["items"][0]["occurrenceCount"] == 1
            latest = store(session, "CV", payload("CV", names=(term,)), previous=cv)
            require_live_cv(session, cv.cv_version_id)
            record_cv_revision(session, latest)
            started = Event()

            def cleanup():
                started.set()
                process_privacy_event({"eventType": "cv.deleted.v2", "payload": {
                    "cvId": str(new_id()), "cvVersionId": str(cv.cv_version_id)}}, lambda: Session(engine))

            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(cleanup)
                try:
                    assert started.wait(5) and not future.done()
                finally:
                    session.commit()  # Always release the writer lock, including assertion failures.
                future.result(timeout=20)
            session.expire_all()
            assert detail(session, skill_id)["sourceCount"] == 1
            assert source_page(session, skill_id, page=0, size=20)["items"][0]["sourceKind"] == "JD"
            with pytest.raises(ApiContractError) as error:
                record_cv_revision(session, latest)
            assert error.value.status_code == 410
            session.rollback()
    finally:
        engine.dispose()
