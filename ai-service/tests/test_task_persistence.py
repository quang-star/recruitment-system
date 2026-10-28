from identity_fixtures import new_id
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Integer, MetaData, create_engine, select
from sqlalchemy.orm import sessionmaker

from app.task.domain import TaskState, TaskType
from app.task.persistence import (
    ProcessingTaskRecord, SqlAlchemyProcessingTaskRepository, _to_domain, _update_time,
)


@pytest.fixture
def sessions():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    table = ProcessingTaskRecord.__table__.to_metadata(metadata)
    table.c.id.type = Integer()
    metadata.create_all(engine)
    yield sessionmaker(engine, expire_on_commit=False)
    engine.dispose()


def test_new_task_retains_utc_instant_after_sqlite_reload(sessions):
    resource, owner = new_id(), new_id()
    with sessions() as session:
        task = SqlAlchemyProcessingTaskRepository(session).start_cv(
            resource, owner, "synthetic/cv.pdf", "a" * 64,
        )
        session.commit()
    assert task.submitted_at.tzinfo is UTC and task.updated_at.tzinfo is UTC
    with sessions() as session:
        repository = SqlAlchemyProcessingTaskRepository(session)
        assert repository.find_by_id(task.id) == task
        record = session.scalar(select(ProcessingTaskRecord))
        assert record.submitted_at == task.submitted_at.astimezone().replace(tzinfo=None)
        completed = repository.complete(task.id, {"synthetic": True})
        session.commit()
    with sessions() as session:
        reloaded = SqlAlchemyProcessingTaskRepository(session).find_by_id(task.id)
        assert reloaded == completed
        assert reloaded.state is TaskState.COMPLETED
        assert reloaded.updated_at >= task.updated_at


@pytest.mark.parametrize("transition,state", [
    ("complete", TaskState.COMPLETED), ("fail", TaskState.FAILED),
    ("retry", TaskState.RETRYING), ("restart", TaskState.PROCESSING),
])
def test_legacy_local_sqlite_times_survive_transitions_and_clock_rollback(sessions, transition, state):
    task_id, resource, owner = new_id(), new_id(), new_id()
    submitted = datetime(2100, 1, 2, 9)
    updated = submitted + timedelta(hours=1)
    with sessions() as session:
        session.add(ProcessingTaskRecord(
            id=task_id, resource_id=resource, owner_user_id=owner,
            task_type=TaskType.PARSE_CV.value, state=TaskState.PROCESSING.value,
            attempt_count=1, object_ref="synthetic/cv.pdf", source_hash="a" * 64,
            submitted_at=submitted, updated_at=updated,
        ))
        session.commit()
    with sessions() as session:
        repository = SqlAlchemyProcessingTaskRepository(session)
        if transition == "complete":
            task = repository.complete(task_id, {"synthetic": True})
        elif transition == "fail":
            task = repository.fail(task_id, "SYNTHETIC_FAILURE")
        elif transition == "retry":
            task = repository.retry(task_id)
        else:
            task = repository.start_cv(resource, owner, "synthetic/cv.pdf", "a" * 64)
        session.commit()
    assert task.state is state
    assert task.submitted_at == submitted.astimezone(UTC)
    assert task.updated_at == updated.astimezone(UTC)
    assert task.updated_at.tzinfo is UTC
    with sessions() as session:
        assert SqlAlchemyProcessingTaskRepository(session).find_by_id(task_id) == task


def test_aware_database_timestamps_keep_their_utc_instant_and_monotonic_order():
    offset = timezone(timedelta(hours=7))
    submitted = datetime(2100, 1, 2, 9, tzinfo=offset)
    updated = submitted + timedelta(hours=1)
    record = ProcessingTaskRecord(
        id=new_id(), task_type=TaskType.PARSE_CV.value,
        state=TaskState.PROCESSING.value, attempt_count=1, processing_generation=0,
        submitted_at=submitted, updated_at=updated,
    )
    task = _to_domain(record)
    assert task.submitted_at == datetime(2100, 1, 2, 2, tzinfo=UTC)
    assert task.updated_at == datetime(2100, 1, 2, 3, tzinfo=UTC)
    assert task.submitted_at.tzinfo is UTC and task.updated_at.tzinfo is UTC
    assert _update_time(record) == task.updated_at
