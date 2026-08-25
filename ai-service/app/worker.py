from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from minio import Minio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.cv.parser import parse_pdf
from app.cv.repository import ParsedCvRevisionRepository
from app.jd.repository import ParsedJdRevisionRepository
from app.matching.algorithm import compute_match
from app.matching.repository import MatchingResultRepository
from app.shared.config import get_settings
from app.task.domain import TaskState
from app.task.persistence import SqlAlchemyProcessingTaskRepository


LOGGER = logging.getLogger(__name__)


def _dead_letter_event(envelope: dict, message, exception: Exception, attempts: int) -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "ai.processing.dead-lettered.v1",
        "schemaVersion": 1,
        "correlationId": envelope.get("correlationId"),
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "sourceTopic": message.topic,
            "sourcePartition": message.partition,
            "sourceOffset": message.offset,
            "attempts": attempts,
            "errorType": type(exception).__name__,
            "originalEnvelope": envelope,
        },
    }


def _object_parts(object_ref: str) -> tuple[str, str]:
    bucket, separator, key = object_ref.partition("/")
    if not separator or not bucket or not key:
        raise ValueError("invalid private object reference")
    return bucket, key


def _read_object(storage: Minio, object_ref: str) -> bytes:
    bucket, key = _object_parts(object_ref)
    response = storage.get_object(bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _processing_event(envelope: dict, task_id: UUID, status: str, source_hash: str,
                      cv_id: UUID, cv_version_id: UUID, failure_code: str | None) -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "cv.processing.updated.v1",
        "schemaVersion": 1,
        "correlationId": envelope["correlationId"],
        "idempotencyKey": f"cv.processing.updated.v1:{cv_version_id}:{status}",
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "cvId": str(cv_id),
            "cvVersionId": str(cv_version_id),
            "processingTaskId": str(task_id),
            "sourceHash": source_hash,
            "status": status,
            "failureCode": failure_code,
        },
    }


async def run() -> None:
    settings = get_settings()
    consumer = AIOKafkaConsumer(
        settings.kafka_cv_uploaded_topic,
        settings.kafka_application_submitted_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
    )
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda value: json.dumps(value, separators=(",", ":")).encode("utf-8"),
    )
    storage = Minio(
        settings.storage_endpoint.removeprefix("http://").removeprefix("https://"),
        access_key=settings.storage_access_key,
        secret_key=settings.storage_secret_key,
        secure=settings.storage_secure,
    )
    factory = sessionmaker(bind=create_engine(settings.db_url, pool_pre_ping=True), expire_on_commit=False)

    await consumer.start()
    await producer.start()
    try:
        async for message in consumer:
            envelope = message.value
            for attempt in range(1, settings.kafka_max_processing_attempts + 1):
                try:
                    if envelope.get("eventType") == "cv.uploaded.v1":
                        await _process_one(envelope, factory, storage, producer, settings)
                    elif envelope.get("eventType") == "application.submitted.v1":
                        await _process_application(envelope, factory, producer, settings)
                    await consumer.commit()
                    break
                except Exception as exc:
                    # Do not log event contents: events can contain private object references.
                    LOGGER.error("AI event processing failed attempt=%s/%s error_type=%s",
                                 attempt, settings.kafka_max_processing_attempts, type(exc).__name__)
                    if attempt == settings.kafka_max_processing_attempts:
                        dead_letter = _dead_letter_event(envelope, message, exc, attempt)
                        await producer.send_and_wait(settings.kafka_dead_letter_topic,
                                                     key=str(envelope.get("eventId", "unknown")).encode("utf-8"),
                                                     value=dead_letter)
                        await consumer.commit()
                        LOGGER.error("AI event moved to DLQ topic=%s source_topic=%s partition=%s offset=%s",
                                     settings.kafka_dead_letter_topic, message.topic,
                                     message.partition, message.offset)
                        break
                    await asyncio.sleep(settings.kafka_retry_backoff_seconds * attempt)
    finally:
        await producer.stop()
        await consumer.stop()


async def _process_one(envelope: dict, factory, storage: Minio,
                       producer: AIOKafkaProducer, settings) -> None:
    if envelope.get("eventType") != "cv.uploaded.v1":
        return
    payload = envelope.get("payload", {})
    cv_id = UUID(payload["cvId"])
    cv_version_id = UUID(payload["cvVersionId"])
    owner_user_id = UUID(payload["candidateUserId"])
    object_ref = payload["objectRef"]
    source_hash = payload["sourceHash"]

    with factory() as session:
        tasks = SqlAlchemyProcessingTaskRepository(session)
        revisions = ParsedCvRevisionRepository(session)
        existing = tasks.find_by_resource_id(cv_version_id)
        if existing and existing.state is TaskState.COMPLETED:
            task = existing
            status = "PARSED"
            failure_code = None
        else:
            task = tasks.start_cv(cv_version_id, owner_user_id, object_ref, source_hash)
            session.commit()
            stage = "storage"
            try:
                raw_document = _read_object(storage, object_ref)
                stage = "parser"
                parsed = parse_pdf(str(cv_version_id), source_hash, raw_document)
                stage = "task-complete"
                task = tasks.complete(task.public_id, parsed)
                revisions.create(cv_version_id, owner_user_id, source_hash, parsed)
                status = "PARSED"
                failure_code = None
            except Exception as exc:
                LOGGER.error("CV processing failed stage=%s error_type=%s", stage, type(exc).__name__)
                task = tasks.fail(task.public_id, "CV_PDF_PARSE_FAILED")
                status = "FAILED"
                failure_code = "CV_PDF_PARSE_FAILED"
            session.commit()

        event = _processing_event(envelope, task.public_id, status, source_hash,
                                  cv_id, cv_version_id, failure_code)
    await producer.send_and_wait(settings.kafka_cv_processing_updated_topic,
                                 key=str(cv_id).encode("utf-8"), value=event)


def _matching_event(envelope: dict, result, application_id: UUID,
                    cv_version_id: UUID, job_version_id: UUID) -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "matching.completed.v1",
        "schemaVersion": 1,
        "correlationId": envelope["correlationId"],
        "idempotencyKey": f"matching.completed.v1:{application_id}:{cv_version_id}:{job_version_id}",
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "applicationId": str(application_id),
            "cvVersionId": str(cv_version_id),
            "jobVersionId": str(job_version_id),
            "matchingResultId": str(result.public_id),
            "status": result.status,
            "finalScore": result.final_score,
            "qualityFlags": result.quality_flags,
            "components": result.components,
            "claims": result.claims,
        },
    }


async def _process_application(envelope: dict, factory,
                               producer: AIOKafkaProducer, settings) -> None:
    payload = envelope.get("payload", {})
    application_id = UUID(payload["applicationId"])
    cv_version_id = UUID(payload["cvVersionId"])
    job_version_id = UUID(payload["jobVersionId"])
    with factory() as session:
        results = MatchingResultRepository(session)
        existing = results.find_latest(application_id)
        if existing and existing.cv_version_id == cv_version_id and existing.job_version_id == job_version_id:
            result = existing
        else:
            cv_revision = ParsedCvRevisionRepository(session).find_confirmed(cv_version_id)
            jd_revision = ParsedJdRevisionRepository(session).find_confirmed(job_version_id)
            if cv_revision is None or jd_revision is None:
                result = results.save(
                    application_id, cv_version_id, job_version_id,
                    "INSUFFICIENT_DATA", 0.0, ["INPUT_REVISION_UNAVAILABLE"], [], [],
                )
            else:
                computed = compute_match(cv_revision.payload, jd_revision.payload)
                result = results.save(
                    application_id, cv_version_id, job_version_id,
                    computed.status, computed.final_score, computed.quality_flags,
                    computed.components, computed.claims,
                )
            session.commit()
        event = _matching_event(envelope, result, application_id, cv_version_id, job_version_id)
    await producer.send_and_wait(settings.kafka_matching_completed_topic,
                                 key=str(application_id).encode("utf-8"), value=event)


if __name__ == "__main__":
    asyncio.run(run())
