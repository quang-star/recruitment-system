from identity_fixtures import new_id
import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import Integer, MetaData, create_engine, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cv.parser import parse_pdf
from app.cv.repository import ParsedCvHeadRecord, ParsedCvRevisionRecord, ParsedCvRevisionRepository
from app.jd.parser import parse_jd
from app.jd.repository import ParsedJdHeadRecord, ParsedJdRevisionRepository
from app.matching.repository import MatchingHeadRecord, MatchingResultRecord, MatchingResultRepository
from app.outbox import OutboxEvent
from app.reprocessing.impact import preview
from app.reprocessing.models import (ControlRequest, CreateBatchRequest, EligibilityResponse, ImpactRequest,
                                     ReprocessingAttempt, ReprocessingAudit, ReprocessingItem)
from app.reprocessing.repository import (batch_record, claim_one, control_batch, create_batch, public_batch)
from app.reprocessing.service import ReprocessingService
from app.reprocessing.source_state import ReprocessingFailure
from app.shared.api import ApiContractError
from app.shared.config import Settings
from app.shared.database import Base
from app.shared.privacy import process_privacy_event
from app.task.persistence import ProcessingTaskRecord, SqlAlchemyProcessingTaskRepository
from app.taxonomy.catalog import SkillCatalogRecord, publish_version, seed_skills
from app.taxonomy.normalizer import build_taxonomy, use_taxonomy
from app.taxonomy.occurrences import SkillSourceOccurrence, record_cv_revision, record_jd_revision


class Reader:
    def __init__(self):
        self.calls = []
        self.callback = None

    def check(self, request, bearer):
        self.calls.append((request, bearer))
        return self.callback(request, bearer) if self.callback else EligibilityResponse(eligible=True, reasonCode="LIVE")


@pytest.fixture
def case():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata = MetaData()
    for table in Base.metadata.sorted_tables:
        clone = table.to_metadata(metadata)
        if "id" in clone.c and isinstance(clone.c.id.type, Integer):
            clone.c.id.type = Integer()
    metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    cv, jd, job, owner, recruiter, application, actor = (new_id() for _ in range(7))
    raw = (Path(__file__).parent / "fixtures/minimal-cv.pdf").read_bytes()
    source_hash = hashlib.sha256(raw).hexdigest()
    jd_source = {"title": "Backend Engineer", "description": "Build reliable Java services.",
                 "requirementsText": "Java and Kafka are required.", "sourceHash": "a" * 64}
    cv_payload = parse_pdf(str(cv), source_hash, raw, ocr_enabled=False)
    jd_payload = parse_jd(str(jd), "a" * 64, jd_source["title"], jd_source["description"], jd_source["requirementsText"])
    with factory() as session:
        session.add(SkillCatalogRecord(id=1, version=0, published_version=0, skills=seed_skills()))
        publish_version(session, seed_skills(), 0)
        cv_repo, jd_repo = ParsedCvRevisionRepository(session), ParsedJdRevisionRepository(session)
        cv_revision = cv_repo.create(cv, owner, source_hash, cv_payload)
        cv_revision = cv_repo.confirm(cv, owner, cv_revision.id, owner)
        jd_revision = jd_repo.upsert(job, jd, recruiter, "a" * 64, jd_payload)
        jd_revision = jd_repo.confirm(jd, recruiter, jd_revision.id, recruiter)
        record_cv_revision(session, cv_revision)
        record_jd_revision(session, jd_revision)
        tasks = SqlAlchemyProcessingTaskRepository(session)
        tasks.complete(tasks.start_cv(cv, owner, "fixture/cv.pdf", source_hash).id, cv_payload)
        tasks.complete(tasks.start_jd(jd, recruiter, "fixture/jd.json", "a" * 64).id, jd_payload)
        prior = MatchingResultRepository(session).save(application, cv, jd, "COMPLETED", 70, [], [], [],
            cv_revision_id=cv_revision.id, jd_revision_id=jd_revision.id,
            as_of_month="2026-10", input_taxonomy_version="1.0.0", input_taxonomy_versions={"cv": "1.0.0", "jd": "1.0.0"})
        publish_version(session, seed_skills(), 1)
        catalog = session.get(SkillCatalogRecord, 1)
        catalog.version = catalog.published_version = 1
        session.commit()
    settings = Settings(db_url="sqlite://", auth_jwks_uri="https://synthetic.invalid/jwks", auth_jwt_issuer="synthetic",
                        auth_jwt_audience="synthetic", ocr_enabled=False)
    reader = Reader()
    reads = []

    def read_object(ref):
        reads.append(ref)
        return raw if ref == "fixture/cv.pdf" else json.dumps(jd_source).encode()

    service = ReprocessingService(factory, settings, reader, read_object)
    yield SimpleNamespace(engine=engine, factory=factory, cv=cv, jd=jd, job=job, owner=owner, recruiter=recruiter,
        application=application, actor=actor, raw=raw, source_hash=source_hash, settings=settings, reader=reader,
        reads=reads, service=service, prior=prior, cv_payload=cv_payload, jd_payload=jd_payload)
    engine.dispose()


def batch_for(case, operation="PARSE_CV", key=None):
    resource = {"PARSE_CV": case.cv, "PARSE_JD": case.jd, "MATCH_APPLICATION": case.application}[operation]
    request = ImpactRequest(operation=operation, resourceIds=[resource], asOfMonth="2026-10")
    with case.factory() as session:
        impact, _ = preview(session, case.settings, request)
        body = CreateBatchRequest(**request.model_dump(), previewHash=impact["previewHash"], reason="Synthetic controlled refresh")
        batch = create_batch(session, case.settings, body, actor=case.actor, correlation=uuid4(), idempotency_key=key or uuid4().hex)
        session.commit()
        return batch.id, body


def step(case, identity):
    return asyncio.run(case.service.step(identity, case.actor, uuid4(), "Bearer synthetic-only"))


@pytest.mark.parametrize("operation", ["PARSE_CV", "PARSE_JD"])
def test_parse_creates_review_revision_preserves_confirmed_head_and_deduplicates_source_counts(case, operation):
    identity, _ = batch_for(case, operation)
    with case.factory() as session:
        old_cv = deepcopy(ParsedCvRevisionRepository(session).find_confirmed(case.cv))
        old_jd = deepcopy(ParsedJdRevisionRepository(session).find_confirmed(case.jd))
        occurrences_before = session.scalar(select(func.count()).select_from(SkillSourceOccurrence))
        task_before = deepcopy(session.scalar(select(ProcessingTaskRecord).where(
            ProcessingTaskRecord.resource_id == (case.cv if operation == "PARSE_CV" else case.jd))).result_payload)
    result = step(case, identity)
    assert result["claimed"] and result["batch"]["state"] == "COMPLETED"
    item = result["batch"]["items"][0]
    assert item["state"] == "COMPLETED" and item["reviewRequired"] and item["attempt"] == 1
    assert step(case, identity)["claimed"] is False
    with case.factory() as session:
        assert ParsedCvRevisionRepository(session).find_confirmed(case.cv) == old_cv
        assert ParsedJdRevisionRepository(session).find_confirmed(case.jd) == old_jd
        if operation == "PARSE_CV":
            revision = ParsedCvRevisionRepository(session).find_owned(case.cv, case.owner)
            previous = old_cv
        else:
            revision = ParsedJdRevisionRepository(session).find_owned(case.jd, case.recruiter)
            previous = old_jd
        assert revision.id == int(item["outputId"]) and revision.status == "PARSED"
        assert revision.payload["document"]["taxonomyVersion"] == "1.0.1"
        assert revision.supersedes_revision_id == previous.id and revision.reprocess_effect_key
        assert session.scalar(select(func.count()).select_from(SkillSourceOccurrence)) == occurrences_before
        assert session.scalar(select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == revision.cv_version_id
            if operation == "PARSE_CV" else ProcessingTaskRecord.resource_id == revision.job_version_id)).result_payload == task_before
        assert session.scalar(select(func.count()).select_from(OutboxEvent)) == 0
    assert len(case.reads) == 1 and len(case.reader.calls) == 2
    assert "sourceHash" not in str(result) and "ownerId" not in str(result) and "fixture/" not in str(result)


def test_batch_creation_replays_without_rechecking_changed_impact_and_conflicts_are_explicit(case):
    identity, body = batch_for(case, key="replay")
    step(case, identity)
    with case.factory() as session:
        replay = create_batch(session, case.settings, body, actor=case.actor, correlation=uuid4(), idempotency_key="replay")
        assert replay.id == identity
        changed = body.model_copy(update={"reason": "Another operation reason"})
        with pytest.raises(ApiContractError, match="another request"):
            create_batch(session, case.settings, changed, actor=case.actor, correlation=uuid4(), idempotency_key="replay")
        assert session.scalar(select(func.count()).select_from(ReprocessingAudit)) == 1


def test_preview_refuses_unknown_versions_missing_resources_and_partial_selection(case):
    with case.factory() as session:
        with pytest.raises(ApiContractError) as error:
            preview(session, case.settings, ImpactRequest(operation="PARSE_CV", taxonomyVersion="9.9.9"))
        assert error.value.code == "REPROCESS_TARGET_UNSUPPORTED"
        with pytest.raises(ApiContractError) as error:
            preview(session, case.settings, ImpactRequest(operation="PARSE_CV", resourceIds=[new_id()]))
        assert error.value.code == "REPROCESS_SOURCE_NOT_FOUND"
        values = []
        for _ in range(1001):
            values.append(ParsedCvRevisionRecord(id=new_id(), cv_version_id=new_id(), owner_user_id=case.owner,
                source_hash="b" * 64, revision_number=1, payload=case.cv_payload, status="PARSED", version=0,
                created_at=datetime.now(UTC), updated_at=datetime.now(UTC)))
        session.add_all(values)
        session.flush()
        with pytest.raises(ApiContractError) as error:
            preview(session, case.settings, ImpactRequest(operation="PARSE_CV"))
        assert error.value.code == "REPROCESS_SELECTION_LIMIT"


def test_preview_change_fences_dispatch_and_owner_edit_fences_a_running_batch(case):
    identity, body = batch_for(case)
    with case.factory() as session:
        latest = ParsedCvRevisionRepository(session).find_owned(case.cv, case.owner)
        ParsedCvRevisionRepository(session).create_revision(case.cv, case.owner, case.source_hash, latest.payload, latest.id)
        session.commit()
        with pytest.raises(ApiContractError) as error:
            create_batch(session, case.settings, body, actor=case.actor, correlation=uuid4(), idempotency_key="changed-preview")
        assert error.value.code == "REPROCESS_PREVIEW_STALE"
    result = step(case, identity)
    assert result["batch"]["items"][0]["safeErrorCode"] == "SOURCE_CHANGED"
    assert case.reads == [] and case.reader.calls == []


@pytest.mark.parametrize("denied_at", [1, 2])
def test_live_core_denial_before_or_after_parse_never_materializes_a_revision(case, denied_at):
    identity, _ = batch_for(case)
    case.reader.callback = lambda *_: EligibilityResponse(eligible=False, reasonCode="ACCESS_REVOKED") if len(
        case.reader.calls) == denied_at else EligibilityResponse(eligible=True, reasonCode="LIVE")
    result = step(case, identity)
    assert result["batch"]["items"][0]["state"] == "SKIPPED"
    assert result["batch"]["items"][0]["safeErrorCode"] == "ACCESS_REVOKED"
    assert len(case.reads) == denied_at - 1
    with case.factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord)) == 1


def test_pause_resume_stale_control_and_pause_during_work_have_explicit_semantics(case):
    identity, _ = batch_for(case)
    with case.factory() as session:
        control_batch(session, identity, ControlRequest(version=0, action="PAUSE", reason="Pause for review"), case.actor, uuid4())
        session.commit()
    assert step(case, identity)["claimed"] is False
    with case.factory() as session:
        with pytest.raises(ApiContractError) as error:
            control_batch(session, identity, ControlRequest(version=0, action="RESUME", reason="Resume reviewed batch"), case.actor, uuid4())
        assert error.value.code == "REPROCESS_BATCH_STALE"
        control_batch(session, identity, ControlRequest(version=1, action="RESUME", reason="Resume reviewed batch"), case.actor, uuid4())
        session.commit()

    def pause_after_claim(*_):
        if len(case.reader.calls) == 1:
            with case.factory() as session:
                control_batch(session, identity, ControlRequest(version=2, action="PAUSE", reason="Allow current item to finish"), case.actor, uuid4())
                session.commit()
        return EligibilityResponse(eligible=True, reasonCode="LIVE")

    case.reader.callback = pause_after_claim
    result = step(case, identity)
    assert result["batch"]["state"] == "PAUSED" and result["batch"]["counts"] == {"COMPLETED": 1}
    with case.factory() as session:
        batch = control_batch(session, identity, ControlRequest(version=3, action="RESUME", reason="Finalize completed checkpoint"), case.actor, uuid4())
        assert batch.state == "COMPLETED" and batch.checkpoint == 1


def test_lease_expiry_fences_old_worker_and_restart_claim_materializes_once(case):
    identity, _ = batch_for(case)
    old_time = datetime.now(UTC) - timedelta(seconds=100)
    with case.factory() as session:
        session.scalar(select(ReprocessingItem)).available_at = old_time
        old = claim_one(session, identity, actor=case.actor, correlation=uuid4(), lease_seconds=1, now=old_time)
        session.commit()
    with case.factory() as session:
        new = claim_one(session, identity, actor=case.actor, correlation=uuid4(), lease_seconds=120)
        session.commit()
    assert old and new and old.token != new.token and new.attempt == 2
    asyncio.run(case.service.execute(old, "Bearer synthetic-only", uuid4()))
    asyncio.run(case.service.execute(new, "Bearer synthetic-only", uuid4()))
    with case.factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord)) == 2
        attempts = session.scalars(select(ReprocessingAttempt).order_by(ReprocessingAttempt.number)).all()
        assert [attempt.outcome for attempt in attempts] == ["LEASE_EXPIRED", "COMPLETED"]


def test_transaction_failure_rolls_back_revision_occurrence_and_checkpoint_then_retries_once(case, monkeypatch):
    identity, _ = batch_for(case)
    original = case.service._materialize

    def fail_after_insert(*args, **kwargs):
        original(*args, **kwargs)
        raise OperationalError("Synthetic transaction fault", None, Exception("Do not expose this body"))

    monkeypatch.setattr(case.service, "_materialize", fail_after_insert)
    result = step(case, identity)
    assert result["batch"]["items"][0]["state"] == "RETRYING" and result["batch"]["checkpoint"] == 0
    with case.factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord)) == 1
        item = session.scalar(select(ReprocessingItem))
        item.available_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    monkeypatch.setattr(case.service, "_materialize", original)
    result = step(case, identity)
    assert result["batch"]["counts"] == {"COMPLETED": 1} and result["batch"]["checkpoint"] == 1
    assert "Do not expose" not in str(result)
    with case.factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord)) == 2


def test_retry_budget_is_bounded_and_exhausted_work_is_not_restarted_by_resume(case):
    identity, _ = batch_for(case)

    def unavailable(*_):
        raise ReprocessingFailure("CORE_ELIGIBILITY_UNAVAILABLE", retryable=True)

    case.reader.callback = unavailable
    for _ in range(3):
        result = step(case, identity)
        with case.factory() as session:
            item = session.scalar(select(ReprocessingItem))
            item.available_at = datetime.now(UTC) - timedelta(seconds=1)
            session.commit()
    assert result["batch"]["state"] == "COMPLETED" and result["batch"]["counts"] == {"FAILED": 1}
    assert step(case, identity)["claimed"] is False and case.reads == []
    with case.factory() as session:
        assert session.scalar(select(func.count()).select_from(ReprocessingAttempt)) == 3


def test_matching_waits_for_review_then_creates_new_truthful_lineage_result_and_atomic_event(case):
    identity, _ = batch_for(case, "MATCH_APPLICATION")
    assert step(case, identity)["batch"]["items"][0]["safeErrorCode"] == "INPUT_REVIEW_REQUIRED"
    with case.factory() as session:
        catalog = {"semanticVersion": "1.0.1", "skills": seed_skills()}
        with use_taxonomy(build_taxonomy(catalog)):
            cv_payload = parse_pdf(str(case.cv), case.source_hash, case.raw, ocr_enabled=False)
            jd_payload = parse_jd(str(case.jd), "a" * 64, "Backend Engineer", "Build Java services.", "Java and Kafka required.")
        cv_repo, jd_repo = ParsedCvRevisionRepository(session), ParsedJdRevisionRepository(session)
        cv_old, jd_old = cv_repo.find_owned(case.cv, case.owner), jd_repo.find_owned(case.jd, case.recruiter)
        cv_new = cv_repo.create_revision(case.cv, case.owner, case.source_hash, cv_payload, cv_old.id)
        jd_new = jd_repo.create_revision(case.job, case.jd, case.recruiter, "a" * 64, jd_payload, jd_old.id)
        cv_repo.confirm(case.cv, case.owner, cv_new.id, case.owner)
        jd_repo.confirm(case.jd, case.recruiter, jd_new.id, case.recruiter)
        session.commit()
    identity, _ = batch_for(case, "MATCH_APPLICATION")
    result = step(case, identity)
    assert result["batch"]["counts"] == {"COMPLETED": 1} and not result["batch"]["items"][0]["reviewRequired"]
    with case.factory() as session:
        latest = MatchingResultRepository(session).find_latest(case.application)
        assert latest.id != case.prior.id and latest.result_generation == 2
        assert latest.supersedes_matching_result_id == case.prior.id
        assert latest.cv_revision_id == cv_new.id and latest.jd_revision_id == jd_new.id
        assert latest.input_taxonomy_versions == {"cv": "1.0.1", "jd": "1.0.1"}
        old = session.scalar(select(MatchingResultRecord).where(MatchingResultRecord.id == case.prior.id))
        assert float(old.final_score) == 70 and old.taxonomy_version == "1.0.0"
        events = session.scalars(select(OutboxEvent)).all()
        assert len(events) == 1 and events[0].envelope["payload"]["resultGeneration"] == 2
        assert events[0].envelope["payload"]["supersedesMatchingResultId"] == str(case.prior.id)
        assert session.get(MatchingHeadRecord, case.application).generation == 2
    assert step(case, identity)["claimed"] is False


@pytest.mark.parametrize("while_running", [False, True])
def test_cv_erasure_scrubs_all_reprocess_refs_hashes_audit_text_and_fences_late_result(case, while_running):
    identity, _ = batch_for(case)

    def erase():
        process_privacy_event({"eventType": "cv.deleted.v2", "payload": {"cvId": str(new_id()), "cvVersionId": str(case.cv)}}, case.factory)

    if while_running:
        original = case.service.read_object

        def read_and_erase(ref):
            raw = original(ref)
            erase()
            return raw

        case.service.read_object = read_and_erase
        step(case, identity)
    else:
        step(case, identity)
        erase()
    with case.factory() as session:
        item = session.scalar(select(ReprocessingItem))
        assert item.resource_id is None and item.cv_version_id is None and item.job_version_id is None and item.application_id is None
        assert item.snapshot is None and item.current_hash is None and item.effect_key is None and item.output_id is None
        assert item.lease_token is None and item.lease_expires_at is None
        assert session.scalar(select(ReprocessingAudit)).reason == "[Source-related audit text erased]"
        public = public_batch(session, batch_record(session, identity))
        assert str(case.cv) not in str(public) and case.source_hash not in str(public) and str(case.owner) not in str(public)
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord)) == 0
        assert session.scalar(select(func.count()).select_from(ParsedCvHeadRecord)) == 0
        assert session.scalar(select(func.count()).select_from(ParsedJdHeadRecord)) == 1
    assert step(case, identity)["claimed"] is False
