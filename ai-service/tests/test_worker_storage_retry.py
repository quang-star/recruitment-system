import asyncio
import hashlib
import json
import os
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from minio.error import InvalidResponseError, S3Error, ServerError
from sqlalchemy import Integer, MetaData, create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from urllib3.exceptions import MaxRetryError, ProtocolError

from app import worker
from app.cv.repository import ParsedCvHeadRecord, ParsedCvRevisionRecord
from app.jd.repository import ParsedJdHeadRecord, ParsedJdRevisionRecord
from app.outbox import OutboxEvent
from app.shared.processing_errors import ProcessingFailure, storage_failure
from app.task.persistence import ProcessingTaskRecord
from app.taxonomy.catalog import SkillCatalogRecord, seed_skills
from app.shared.privacy import PrivacyTombstone


def s3_error(code):
    return S3Error(None, code, "private storage detail", "private/key", None, None)


@pytest.mark.parametrize("exception,code,retryable", [
    (TimeoutError("private"), "SOURCE_STORAGE_UNAVAILABLE", True),
    (ConnectionError("private"), "SOURCE_STORAGE_UNAVAILABLE", True),
    (ProtocolError("private"), "SOURCE_STORAGE_UNAVAILABLE", True),
    (MaxRetryError(None, "private/key"), "SOURCE_STORAGE_UNAVAILABLE", True),
    (ServerError("private", 503), "SOURCE_STORAGE_UNAVAILABLE", True),
    (ServerError("private", 429), "SOURCE_STORAGE_UNAVAILABLE", True),
    (InvalidResponseError(502, "text/html", "private"), "SOURCE_STORAGE_UNAVAILABLE", True),
    (s3_error("SlowDown"), "SOURCE_STORAGE_UNAVAILABLE", True),
    (s3_error("NoSuchKey"), "SOURCE_OBJECT_NOT_FOUND", False),
    (s3_error("NoSuchBucket"), "SOURCE_OBJECT_NOT_FOUND", False),
    (s3_error("AccessDenied"), "SOURCE_STORAGE_ACCESS_DENIED", False),
    (s3_error("SignatureDoesNotMatch"), "SOURCE_STORAGE_ACCESS_DENIED", False),
    (ServerError("private", 400), "SOURCE_STORAGE_READ_FAILED", False),
    (RuntimeError("private"), "SOURCE_STORAGE_READ_FAILED", False),
])
def test_storage_failure_uses_fixed_code_without_private_message(exception, code, retryable):
    failure = storage_failure(exception)
    assert failure.code == code
    assert failure.retryable is retryable
    assert str(failure) == code


def test_read_failure_releases_connection_and_uses_safe_error():
    response = Mock()
    response.read.side_effect = ProtocolError("private candidate detail")
    storage = Mock()
    storage.get_object.return_value = response
    with pytest.raises(ProcessingFailure, match="^SOURCE_STORAGE_UNAVAILABLE$"):
        worker._read_object(storage, "private-bucket/private-key")
    response.close.assert_called_once()
    response.release_conn.assert_called_once()


def test_invalid_object_reference_does_not_access_storage():
    storage = Mock()
    with pytest.raises(ProcessingFailure, match="^SOURCE_OBJECT_REF_INVALID$"):
        worker._read_object(storage, "invalid")
    storage.get_object.assert_not_called()


@pytest.fixture(params=["cv", "jd"])
def processing(request, monkeypatch):
    # Optional isolated, migrated PostgreSQL DB. Each test uses new UUIDs and
    # preserves rows; never point this variable at an application database.
    db_url = os.getenv("WORKER_TEST_DB_URL")
    engine = create_engine(db_url or "sqlite://")
    if not db_url:
        metadata = MetaData()
        for record in (ProcessingTaskRecord, ParsedCvRevisionRecord, ParsedJdRevisionRecord,
                       ParsedCvHeadRecord, ParsedJdHeadRecord, OutboxEvent, SkillCatalogRecord, PrivacyTombstone):
            table = record.__table__.to_metadata(metadata)
            # SQLite needs INTEGER for autoincrement; production models remain BIGINT.
            if "id" in table.c and isinstance(table.c.id.type, Integer):
                table.c.id.type = Integer()
        metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    if not db_url:
        with sessions() as session:
            session.add(SkillCatalogRecord(id=1, version=0, skills=seed_skills()))
            session.commit()
    @event.listens_for(sessions, "loaded_as_persistent")
    def restore_sqlite_timezone(session, record):
        # SQLite strips offsets; PostgreSQL TIMESTAMPTZ (the production DB)
        # returns aware datetimes. Preserve that behavior in this test adapter.
        if not db_url and isinstance(record, ProcessingTaskRecord):
            local_timezone = datetime.now().astimezone().tzinfo
            record.submitted_at = record.submitted_at.replace(tzinfo=local_timezone)
            record.updated_at = record.updated_at.replace(tzinfo=local_timezone)
    resource_id, owner_id, aggregate_id = uuid4(), uuid4(), uuid4()
    source_hash = hashlib.sha256(b"synthetic PDF").hexdigest()
    snapshot = {"title": "Engineer", "description": "Develop software",
                "requirementsText": "Java", "sourceHash": source_hash}
    raw = b"synthetic PDF" if request.param == "cv" else json.dumps(snapshot).encode()
    payload = {"objectRef": "private-bucket/private-key", "sourceHash": source_hash}
    if request.param == "cv":
        payload.update(cvId=str(aggregate_id), cvVersionId=str(resource_id), candidateUserId=str(owner_id))
        event_type = "cv.uploaded.v1"
        parser_name, revision = "parse_pdf", ParsedCvRevisionRecord
        persist_class, persist_name = worker.ParsedCvRevisionRepository, "create"
    else:
        payload.update(jobId=str(aggregate_id), jobVersionId=str(resource_id), recruiterUserId=str(owner_id))
        event_type = "job.version.submitted.v1"
        parser_name, revision = "parse_jd", ParsedJdRevisionRecord
        persist_class, persist_name = worker.ParsedJdRevisionRepository, "upsert"
    envelope = {"eventId": str(uuid4()), "eventType": event_type, "schemaVersion": 1,
                "correlationId": str(uuid4()), "payload": payload}
    message = SimpleNamespace(topic=event_type, partition=0, offset=1, value=json.dumps(envelope).encode())
    settings = SimpleNamespace(kafka_max_processing_attempts=3, kafka_retry_backoff_seconds=1,
                               kafka_dead_letter_topic="ai.processing.dlq.v1",
                               kafka_cv_processing_updated_topic="cv.processing.updated.v1",
                               kafka_job_processing_updated_topic="job.processing.updated.v1",
                               ocr_enabled=False, ocr_max_pages=5, ocr_timeout_seconds=60)
    parser = Mock(return_value={"synthetic": True})
    monkeypatch.setattr(worker, parser_name, parser)
    monkeypatch.setattr(worker, "get_extractor", lambda _, **kwargs: None)
    response = Mock()
    response.read.return_value = raw
    storage = Mock()
    storage.get_object.return_value = response
    consumer, producer, sleep = AsyncMock(), AsyncMock(), AsyncMock()
    monkeypatch.setattr(worker.asyncio, "sleep", sleep)
    case = SimpleNamespace(sessions=sessions, envelope=envelope, message=message, settings=settings,
                           storage=storage, response=response, consumer=consumer, producer=producer,
                           sleep=sleep, parser=parser, revision=revision, kind=request.param,
                           persist_class=persist_class, persist_name=persist_name,
                           resource_id=resource_id, aggregate_id=aggregate_id)
    yield case
    engine.dispose()


def handle(case):
    asyncio.run(worker._handle_message(case.message, case.consumer, case.sessions,
                                      case.storage, case.producer, case.settings))


def saved(case):
    with case.sessions() as session:
        task = session.scalar(select(ProcessingTaskRecord).where(
            ProcessingTaskRecord.resource_id == case.resource_id))
        events = [row.envelope for row in session.scalars(select(OutboxEvent).where(
            OutboxEvent.message_key == str(case.aggregate_id)).order_by(OutboxEvent.created_at))]
        version_column = case.revision.cv_version_id if case.kind == "cv" else case.revision.job_version_id
        count = session.scalar(select(func.count()).select_from(case.revision).where(
            version_column == case.resource_id))
        return task, events, count


def test_transient_storage_recovery_never_publishes_failed_and_redelivery_keeps_revision(processing):
    case = processing
    case.storage.get_object.side_effect = [TimeoutError("private"), case.response]
    intermediate = []
    case.sleep.side_effect = lambda _: intermediate.append(saved(case))
    handle(case)
    assert intermediate[0][0].state == "RETRYING"
    assert intermediate[0][0].safe_error_code is None
    assert intermediate[0][1:] == ([], 0)
    task, events, count = saved(case)
    assert task.state == "COMPLETED" and task.attempt_count == 2
    assert count == 1
    assert [event["payload"]["status"] for event in events] == ["PARSED"]
    assert events[0]["payload"]["failureCode"] is None
    case.consumer.commit.assert_awaited_once()
    case.producer.send_and_wait.assert_not_awaited()
    handle(case)
    task, events, count = saved(case)
    assert task.attempt_count == 2 and count == 1
    case.parser.assert_called_once()
    assert events[0]["idempotencyKey"] == events[1]["idempotencyKey"]


def test_exhausted_storage_failure_is_persisted_before_dlq_and_ack(processing, caplog):
    case = processing
    case.storage.get_object.side_effect = ConnectionError("private candidate detail")
    def assert_durable_failure(*args, **kwargs):
        task, events, count = saved(case)
        assert task.state == "FAILED" and task.attempt_count == 3
        assert task.safe_error_code == "SOURCE_STORAGE_UNAVAILABLE"
        assert count == 0 and len(events) == 1
        assert events[0]["payload"]["failureCode"] == task.safe_error_code
        assert kwargs["value"]["payload"]["errorCode"] == task.safe_error_code
        case.consumer.commit.assert_not_awaited()
    case.producer.send_and_wait.side_effect = assert_durable_failure
    handle(case)
    assert case.storage.get_object.call_count == 3
    assert [call.args[0] for call in case.sleep.await_args_list] == [1, 2]
    case.producer.send_and_wait.assert_awaited_once()
    case.consumer.commit.assert_awaited_once()
    case.parser.assert_not_called()
    assert "private candidate detail" not in caplog.text
    assert "private candidate detail" not in str(case.producer.send_and_wait.call_args)


@pytest.mark.parametrize("exception,code", [
    (s3_error("NoSuchKey"), "SOURCE_OBJECT_NOT_FOUND"),
    (s3_error("AccessDenied"), "SOURCE_STORAGE_ACCESS_DENIED"),
])
def test_permanent_storage_failure_does_not_retry(processing, exception, code):
    case = processing
    case.storage.get_object.side_effect = exception
    handle(case)
    task, events, count = saved(case)
    assert task.state == "FAILED" and task.attempt_count == 1
    assert task.safe_error_code == code and count == 0
    assert events[0]["payload"]["failureCode"] == code
    case.sleep.assert_not_awaited()
    case.producer.send_and_wait.assert_not_awaited()
    case.consumer.commit.assert_awaited_once()


def test_corrupted_source_does_not_spend_storage_retries(processing, caplog):
    case = processing
    case.parser.side_effect = ValueError("private source detail")
    handle(case)
    task, events, count = saved(case)
    expected = "CV_PDF_PARSE_FAILED" if case.kind == "cv" else "JD_PARSE_FAILED"
    assert task.state == "FAILED" and task.attempt_count == 1
    assert task.safe_error_code == expected and count == 0
    assert events[0]["payload"]["failureCode"] == expected
    case.sleep.assert_not_awaited()
    case.producer.send_and_wait.assert_not_awaited()
    assert "private source detail" not in caplog.text


def test_source_hash_mismatch_is_rejected_before_parser(processing):
    case = processing
    case.envelope["payload"]["sourceHash"] = "f" * 64
    case.message.value = json.dumps(case.envelope).encode()
    handle(case)
    task, events, count = saved(case)
    expected = "CV_SOURCE_HASH_MISMATCH" if case.kind == "cv" else "JD_SOURCE_HASH_MISMATCH"
    assert task.safe_error_code == expected and count == 0
    assert events[0]["payload"]["failureCode"] == expected
    case.parser.assert_not_called()
    case.sleep.assert_not_awaited()


def test_revision_persistence_failure_rolls_back_completion_then_retries(processing, monkeypatch):
    case = processing
    original = getattr(case.persist_class, case.persist_name)
    calls = []
    def fail_once(self, *args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("private database detail")
        return original(self, *args, **kwargs)
    monkeypatch.setattr(case.persist_class, case.persist_name, fail_once)
    handle(case)
    task, events, count = saved(case)
    assert task.state == "COMPLETED" and task.attempt_count == 2
    assert count == 1 and len(events) == 1
    assert events[0]["payload"]["status"] == "PARSED"
    assert task.safe_error_code is None
    case.producer.send_and_wait.assert_not_awaited()


def test_dlq_delivery_failure_does_not_ack_message(processing):
    case = processing
    case.storage.get_object.side_effect = TimeoutError("private")
    case.producer.send_and_wait.side_effect = RuntimeError("broker unavailable")
    with pytest.raises(RuntimeError, match="broker unavailable"):
        handle(case)
    assert saved(case)[0].state == "FAILED"
    case.consumer.commit.assert_not_awaited()


def test_clock_correction_during_storage_retry_keeps_task_timestamps_valid(processing, monkeypatch):
    from app.task import persistence
    case = processing
    now = datetime.now().astimezone()
    clock = Mock()
    clock.now.side_effect = [now] + [now - timedelta(seconds=5)] * 20
    monkeypatch.setattr(persistence, "datetime", clock)
    case.storage.get_object.side_effect = [TimeoutError("synthetic"), case.response]
    handle(case)
    task, events, count = saved(case)
    assert task.state == "COMPLETED" and task.attempt_count == 2
    assert task.updated_at >= task.submitted_at
    assert count == 1 and len(events) == 1


def test_ack_failure_does_not_retry_completed_processing_or_dead_letter(processing):
    case = processing
    case.consumer.commit.side_effect = RuntimeError("ack unavailable")
    with pytest.raises(RuntimeError, match="ack unavailable"):
        handle(case)
    task, events, count = saved(case)
    assert task.state == "COMPLETED" and task.attempt_count == 1
    assert count == 1 and len(events) == 1
    case.sleep.assert_not_awaited()
    case.producer.send_and_wait.assert_not_awaited()


@pytest.mark.parametrize("snapshot", [[], {}, {"title": 1, "description": "x",
                                             "requirementsText": "x", "sourceHash": "a" * 64}])
@pytest.mark.parametrize("processing", ["jd"], indirect=True)
def test_invalid_jd_snapshot_is_permanent(processing, snapshot):
    case = processing
    case.response.read.return_value = json.dumps(snapshot).encode()
    handle(case)
    assert saved(case)[0].safe_error_code == "JD_SOURCE_INVALID"
    case.parser.assert_not_called()
    case.sleep.assert_not_awaited()


@pytest.mark.parametrize("processing", ["cv"], indirect=True)
def test_user_retry_recovers_same_file_and_ignores_late_old_upload(processing):
    case = processing
    original_message = case.message.value
    case.storage.get_object.side_effect = TimeoutError("private")
    handle(case)
    old_failure = saved(case)[1][0]
    case.storage.get_object.side_effect = None
    case.envelope["payload"]["processingGeneration"] = 2
    case.envelope["eventId"] = str(uuid4())
    case.message.value = json.dumps(case.envelope).encode()
    handle(case)
    task, events, count = saved(case)
    assert task.state == "COMPLETED" and task.processing_generation == 2
    assert task.attempt_count == 4 and count == 1
    assert events[-1]["payload"]["processingGeneration"] == 2
    assert events[-1]["payload"]["status"] == "PARSED"
    assert events[-1]["idempotencyKey"] != old_failure["idempotencyKey"]
    reads = case.storage.get_object.call_count
    case.message.value = original_message
    handle(case)
    assert len(saved(case)[1]) == 2
    assert case.storage.get_object.call_count == reads
    assert saved(case)[0].processing_generation == 2
    assert saved(case)[0].attempt_count == 4


@pytest.mark.parametrize("processing", ["cv"], indirect=True)
def test_new_retry_failure_keeps_its_own_projection_key(processing):
    case = processing
    case.storage.get_object.side_effect = TimeoutError("private")
    handle(case)
    case.envelope["payload"]["processingGeneration"] = 2
    case.envelope["eventId"] = str(uuid4())
    case.message.value = json.dumps(case.envelope).encode()
    handle(case)
    task, events, count = saved(case)
    assert task.state == "FAILED" and task.processing_generation == 2 and task.attempt_count == 6
    assert [e["payload"]["processingGeneration"] for e in events] == [0, 2]
    assert events[0]["idempotencyKey"] != events[1]["idempotencyKey"]
    assert count == 0


@pytest.mark.parametrize("processing", ["cv"], indirect=True)
def test_completed_result_is_reused_if_retry_was_queued_before_completion_projection(processing):
    case = processing
    handle(case)
    case.envelope["payload"]["processingGeneration"] = 2
    case.message.value = json.dumps(case.envelope).encode()
    handle(case)
    task, events, count = saved(case)
    assert task.state == "COMPLETED" and task.processing_generation == 2 and task.attempt_count == 1
    assert count == 1 and events[-1]["payload"]["processingGeneration"] == 2
    case.parser.assert_called_once()
    handle(case)
    assert saved(case)[0].attempt_count == 1 and saved(case)[2] == 1
    assert saved(case)[1][-1]["idempotencyKey"] == saved(case)[1][-2]["idempotencyKey"]


@pytest.mark.parametrize("generation", [-1, True, "2", 1.5, None, 2**63])
def test_invalid_cv_processing_generation_is_not_accepted(generation):
    with pytest.raises(ValueError, match="Invalid CV processing generation"):
        worker._cv_generation({"payload": {"processingGeneration": generation}})
