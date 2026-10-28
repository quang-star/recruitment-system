from uuid import uuid4
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.shared.api import install_api_conventions
from app.shared.api_ids import BusinessId
from app.shared.identities import JOB_SKILL_ID_MIN, MAX_ID, parse_id
from app.shared.privacy import process_privacy_event
from app.shared.database import Base
from app.outbox import OutboxEvent, enqueue
from app.task.domain import TaskType
from app.task.persistence import ProcessingTaskRecord, SqlAlchemyProcessingTaskRepository
from app.taxonomy.catalog import _next_skill_id
from app.shared.api import ApiContractError


def test_catalog_allocation_respects_migrated_claim_ids_absent_from_the_catalog():
    # Execute the reservation SELECT against SQLite without claiming to verify
    # PostgreSQL migration/locking. The adapter exposes the production branch.
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE legacy_identity_map(service TEXT,entity_type TEXT,entity_id BIGINT)'))
        connection.execute(text("INSERT INTO legacy_identity_map VALUES ('ai','skill',5001),('auth','user',9007199254740993),('ai','task',7000)"))
        adapter = SimpleNamespace(get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name='postgresql')), execute=connection.execute)
        skills = [{'stableId': '1'}]
        allocated = _next_skill_id(adapter, skills)
        assert allocated == 5002
        skills.append({'stableId': str(allocated)})
        assert _next_skill_id(adapter, skills) == 5003
    engine.dispose()


def test_canonical_skills_cannot_enter_the_job_local_identity_range():
    engine = create_engine('sqlite://')
    with Session(engine) as session:
        with pytest.raises(ApiContractError) as failure:
            _next_skill_id(session, [{'stableId': str(JOB_SKILL_ID_MIN - 1)}])
        assert failure.value.code == 'SKILL_ID_RANGE_EXHAUSTED'
    engine.dispose()


@pytest.mark.parametrize('digest', [b'\x00' * 32, b'\xff' * 32])
def test_job_local_claim_ids_cannot_alias_canonical_skills(monkeypatch, digest):
    from app.matching import algorithm
    monkeypatch.setattr(algorithm.hashlib, 'sha256', lambda _: SimpleNamespace(digest=lambda: digest))
    identity = parse_id(algorithm._job_skill_id({'raw': 'SyntheticFramework', 'confirmedByRecruiter': True}, '1'))
    assert JOB_SKILL_ID_MIN <= identity <= MAX_ID


@pytest.mark.parametrize('value', [0, -1, True, 1.0, '', '01', '+1', '-1', ' 1', str(MAX_ID + 1), str(uuid4())])
def test_business_ids_reject_noncanonical_input(value):
    with pytest.raises(ValueError):
        parse_id(value)


def test_http_ids_are_decimal_strings_and_counters_stay_numbers():
    app = FastAPI()
    install_api_conventions(app)

    @app.get('/identity/{identity}')
    def identity(identity: BusinessId):
        return {'id': identity, 'actorId': identity, 'resourceIds': [identity], 'count': 7, 'version': 2}

    with TestClient(app) as client:
        assert client.get(f'/identity/{MAX_ID}').json() == {'id': str(MAX_ID), 'actorId': str(MAX_ID), 'resourceIds': [str(MAX_ID)], 'count': 7, 'version': 2}
        assert client.get('/identity/01').status_code == 422
        assert client.get(f'/identity/{MAX_ID + 1}').status_code == 422


def test_same_numeric_cv_and_jd_ids_have_independent_tasks_and_erasure():
    # Import all models registered by the service before creating a disposable
    # in-memory schema. No application database or external service is used.
    from app.cv import repository as cv_models  # noqa: F401
    from app.jd import repository as jd_models  # noqa: F401
    from app.matching import repository as match_models  # noqa: F401
    from app.matching import shadow as shadow_models  # noqa: F401
    from app.shared import extraction_usage as usage_models  # noqa: F401
    from app.taxonomy import occurrences as occurrence_models  # noqa: F401
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        repository = SqlAlchemyProcessingTaskRepository(session)
        cv = repository.start_cv(1, 1, 'synthetic/cv.pdf', 'a' * 64)
        jd = repository.start_jd(1, 1, 'synthetic/jd.txt', 'b' * 64)
        assert cv.id != jd.id
        assert repository.find_by_resource_id(1, TaskType.PARSE_CV).id == cv.id
        assert repository.find_by_resource_id(1, TaskType.PARSE_JD).id == jd.id
        for event_type, payload in [('cv.processing.updated.v2', {'cvVersionId': '1'}), ('job.processing.updated.v2', {'jobVersionId': '1'}), ('matching.completed.v2', {'applicationId': '1'})]:
            enqueue(session, event_type, '1', {'eventId': str(uuid4()), 'eventType': event_type, 'payload': payload})
        session.commit()
    from sqlalchemy.orm import sessionmaker
    factory = sessionmaker(engine)
    process_privacy_event({'eventType': 'cv.deleted.v2', 'payload': {'cvId': '1', 'cvVersionId': '1'}}, factory)
    with Session(engine) as session:
        assert session.get(ProcessingTaskRecord, cv.id).safe_error_code == 'CV_DELETED'
        assert session.get(ProcessingTaskRecord, jd.id).safe_error_code is None
        assert {event.envelope['eventType'] for event in session.query(OutboxEvent)} == {'job.processing.updated.v2', 'matching.completed.v2'}
    engine.dispose()
