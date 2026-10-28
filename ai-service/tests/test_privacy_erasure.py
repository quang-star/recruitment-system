from identity_fixtures import legacy_id, new_id
import asyncio
import hashlib
import os
from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from sqlalchemy import create_engine, MetaData, Integer, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app import worker
from app.cv.repository import ParsedCvRevisionRecord
from app.matching.repository import MatchingResultRepository
from app.shared.privacy import process_privacy_event, require_live_cv, erased
from app.shared.database import Base
from app.shared.api import ApiContractError
from app.task.persistence import ProcessingTaskRecord
from app.taxonomy.catalog import SkillCatalogRecord, seed_skills
from app.outbox import OutboxEvent
from app.shared import extraction_usage  # noqa: F401 - registers erasure-owned data
from app.matching.shadow import MatchingShadowResult


@pytest.fixture
def case(monkeypatch):
    url = os.getenv("EXTRACTION_TEST_DB_URL")
    engine = create_engine(url) if url else create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    if not url:
        metadata = MetaData()
        for table in Base.metadata.sorted_tables:
            copy = table.to_metadata(metadata)
            if "id" in copy.c and isinstance(copy.c.id.type, Integer):
                copy.c.id.type = Integer()
        metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    if not url:
        with factory() as session:
            session.add(SkillCatalogRecord(id=1, version=0, skills=seed_skills()))
            session.commit()
    version_id, cv_id, owner, app_id, job_version_id = (new_id() for _ in range(5))
    raw = b"synthetic PDF"
    envelope = {"eventType": "cv.uploaded.v2", "eventId": str(uuid4()), "correlationId": str(uuid4()),
                "payload": {"cvId": str(cv_id), "cvVersionId": str(version_id), "candidateUserId": str(owner),
                            "sourceHash": hashlib.sha256(raw).hexdigest(), "objectRef": "fixture/cv.pdf"}}
    settings = SimpleNamespace(ocr_enabled=False, ocr_max_pages=1, ocr_timeout_seconds=1,
                               kafka_cv_processing_updated_topic="cv.processing.updated.v2",
                               kafka_matching_completed_topic="matching.completed.v2")
    parser = Mock(return_value={"synthetic": "private CV content"})
    monkeypatch.setattr(worker, "parse_pdf", parser)
    monkeypatch.setattr(worker, "get_extractor", lambda _, **kwargs: None)
    monkeypatch.setattr(worker, "_read_object", lambda *_: raw)
    value = SimpleNamespace(factory=factory, version_id=version_id, cv_id=cv_id, owner=owner,
                            app_id=app_id, job_version_id=job_version_id, envelope=envelope, settings=settings, parser=parser)
    yield value
    engine.dispose()


def cv_delete(case):
    return {"eventType": "cv.deleted.v2", "payload": {"cvId": str(case.cv_id), "cvVersionId": str(case.version_id)}}


def process(case):
    asyncio.run(worker._process_one(case.envelope, case.factory, None, None, case.settings))


def test_erasure_removes_payloads_and_late_parse_match_or_confirm_cannot_restore(case):
    process(case)
    with case.factory() as session:
        MatchingResultRepository(session).save(case.app_id, case.version_id, case.job_version_id,
                                              "COMPLETED", 85, [], [], [{"private": "evidence"}])
        session.commit()
    process_privacy_event(cv_delete(case), case.factory)
    process_privacy_event(cv_delete(case), case.factory)
    process(case)
    application = {"payload": {"applicationId": str(case.app_id), "cvVersionId": str(case.version_id),
                                "jobVersionId": str(case.job_version_id)}}
    asyncio.run(worker._process_application(application, case.factory, None, case.settings))
    with case.factory() as session:
        assert erased(session, "CV", case.version_id)
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord).where(
            ParsedCvRevisionRecord.cv_version_id == case.version_id)) == 0
        assert MatchingResultRepository(session).find_latest(case.app_id) is None
        task = session.scalar(select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == case.version_id))
        assert task.result_payload is None and task.object_ref is None and task.owner_user_id is None
        assert session.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.message_key == str(case.cv_id))) == 0
        with pytest.raises(ApiContractError) as error:
            require_live_cv(session, case.version_id)
        assert error.value.status_code == 410
    case.parser.assert_called_once()


def test_deletion_while_parser_is_running_fences_its_late_result(case):
    def delete_during_parse(*args, **kwargs):
        process_privacy_event(cv_delete(case), case.factory)
        return {"synthetic": "late private content"}
    case.parser.side_effect = delete_during_parse
    process(case)
    with case.factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord).where(
            ParsedCvRevisionRecord.cv_version_id == case.version_id)) == 0
        task = session.scalar(select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == case.version_id))
        assert task.result_payload is None


def test_application_revocation_does_not_delete_owned_cv_or_other_application(case):
    process(case)
    other_id = new_id()
    with case.factory() as session:
        repository = MatchingResultRepository(session)
        for app_id in (case.app_id, other_id):
            repository.save(app_id, case.version_id, case.job_version_id, "COMPLETED", 80, [], [], [])
        session.commit()
    process_privacy_event({"eventType": "application.cv-access.revoked.v2", "payload": {"applicationId": str(case.app_id)}}, case.factory)
    with case.factory() as session:
        require_live_cv(session, case.version_id)
        assert MatchingResultRepository(session).find_latest(case.app_id) is None
        assert MatchingResultRepository(session).find_latest(other_id) is not None
    application = {"payload": {"applicationId": str(case.app_id), "cvVersionId": str(case.version_id),
                                "jobVersionId": str(case.job_version_id)}}
    asyncio.run(worker._process_application(application, case.factory, None, case.settings))
    with case.factory() as session:
        assert MatchingResultRepository(session).find_latest(case.app_id) is None


def test_outside_it_scope_blocks_direct_and_replayed_matching_requests(case):
    event = {"payload": {"jobId": str(new_id()), "jobVersionId": str(case.job_version_id),
                        "recruiterUserId": str(case.owner), "matchingDomain": "OUTSIDE_IT",
                        "sourceHash": "a" * 64, "objectRef": "unsupported/version"}}
    asyncio.run(worker._process_job(event, case.factory, None, None, case.settings))
    application = {"payload": {"applicationId": str(case.app_id), "cvVersionId": str(case.version_id),
                                "jobVersionId": str(case.job_version_id)}}
    for _ in range(2):
        asyncio.run(worker._process_application(application, case.factory, None, case.settings))
    with case.factory() as session:
        assert MatchingResultRepository(session).find_latest(case.app_id) is None
        assert session.scalar(select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == case.job_version_id)) is None


def test_shadow_persists_candidate_and_lineage_but_publishes_baseline_then_erases_with_cv(case, monkeypatch):
    from app.matching.algorithm import compute_match
    from app.matching.semantic import compare_hybrid
    from app.taxonomy.catalog import publish_version
    with case.factory() as session:
        publish_version(session, seed_skills(), 2)
        publish_version(session, seed_skills(), 3)
        session.commit()
    cv = {"document": {"taxonomyVersion": "1.0.2"}, "skills": [{"raw": "Java", "normalizationStatus": "KNOWN",
          "canonicalSkillId": str(legacy_id('32af50d2-0649-589a-b10c-ee404cef802d')), "provenance": "EXTRACTED", "evidenceIds": []}]}
    jd = {"document": {"jobVersionId": str(case.job_version_id), "taxonomyVersion": "1.0.3"},
          "title": {"raw": "Backend"}, "requirements": {"requiredSkills": [{"raw": "Java", "normalizationStatus": "KNOWN",
          "canonicalSkillId": str(legacy_id('32af50d2-0649-589a-b10c-ee404cef802d')), "confirmedByRecruiter": True}]}}
    cv_rev = SimpleNamespace(payload=cv, id=new_id())
    jd_rev = SimpleNamespace(payload=jd, id=new_id())
    monkeypatch.setattr(worker.ParsedCvRevisionRepository, "find_confirmed", lambda *_: cv_rev)
    monkeypatch.setattr(worker.ParsedJdRevisionRepository, "find_confirmed", lambda *_: jd_rev)
    provider = Mock()
    provider.embed.return_value = [[1., 0.], [1., 0.]]
    monkeypatch.setattr(worker, "compare_hybrid", lambda c, j, b, **kwargs: compare_hybrid(c, j, b, provider=provider))
    case.settings.matching_mode = "shadow"
    event = {"correlationId": str(uuid4()), "payload": {"applicationId": str(case.app_id),
             "cvVersionId": str(case.version_id), "jobVersionId": str(case.job_version_id)}}
    asyncio.run(worker._process_application(event, case.factory, None, case.settings))
    asyncio.run(worker._process_application(event, case.factory, None, case.settings))
    with case.factory() as session:
        result = MatchingResultRepository(session).find_latest(case.app_id)
        comparison = session.get(MatchingShadowResult, result.id)
        assert comparison.semantic_score == 100 and comparison.status == "SHADOW"
        assert result.algorithm_version == "baseline-v5" and result.final_score == compute_match(cv, jd).final_score
        assert result.taxonomy_version == "1.0.3"
        assert result.input_taxonomy_versions == {"cv": "1.0.2", "jd": "1.0.3"}
        assert result.cv_revision_id == cv_rev.id and result.jd_revision_id == jd_rev.id
        assert comparison.baseline_score == result.final_score
    provider.embed.assert_called_once()
    process_privacy_event(cv_delete(case), case.factory)
    with case.factory() as session:
        assert session.scalar(select(MatchingShadowResult).where(MatchingShadowResult.cv_version_id == case.version_id)) is None
