from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from minio import Minio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.cv.parser import parse_pdf
from app.outbox import enqueue
from app.cv.repository import ParsedCvRevisionRepository
from app.jd.repository import ParsedJdRevisionRepository
from app.jd.parser import parse_jd
from app.matching.algorithm import ALGORITHM_VERSION, compute_match
from app.matching.repository import MatchingResultRepository, _input_unavailable
from app.shared.config import get_settings
from app.shared.extraction import get_extractor
from app.shared.extraction_types import ExtractionContext
from app.shared.processing_errors import ProcessingFailure, storage_failure
from app.task.domain import TaskState
from app.task.persistence import SqlAlchemyProcessingTaskRepository


LOGGER = logging.getLogger(__name__)


def _decode_envelope(value: bytes) -> dict:
    if not isinstance(value, bytes):
        raise ValueError("Kafka message must contain bytes")
    try:
        decoded = value.decode("utf-8")
    except UnicodeDecodeError as exception:
        raise ValueError("Kafka message is not valid UTF-8") from exception
    try:
        envelope = json.loads(decoded)
    except json.JSONDecodeError as exception:
        raise ValueError("Kafka message is not valid JSON") from exception
    if not isinstance(envelope, dict):
        raise ValueError("Kafka envelope must be a JSON object")
    if not isinstance(envelope.get("eventType"), str) or not envelope["eventType"].strip():
        raise ValueError("Kafka envelope eventType is required")
    if not isinstance(envelope.get("payload"), dict):
        raise ValueError("Kafka envelope payload must be an object")
    return envelope


def _invalid_message_event(message, exception: Exception) -> dict:
    raw = message.value if isinstance(message.value, bytes) else b""
    return {
        "eventId": str(uuid4()),
        "eventType": "ai.processing.dead-lettered.v1",
        "schemaVersion": 1,
        "correlationId": None,
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "sourceTopic": message.topic,
            "sourcePartition": message.partition,
            "sourceOffset": message.offset,
            "attempts": 1,
            "errorType": type(exception).__name__,
            "errorCode": "INVALID_EVENT_ENVELOPE",
            "rawSha256": hashlib.sha256(raw).hexdigest(),
            "rawSize": len(raw),
        },
    }


def _dead_letter_event(envelope: dict, message, exception: Exception, attempts: int) -> dict:
    event: dict = {
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
    if isinstance(exception, ProcessingFailure):
        event["payload"]["errorCode"] = exception.code
    return event


def _object_parts(object_ref: str) -> tuple[str, str]:
    bucket, separator, key = object_ref.partition("/")
    if not separator or not bucket or not key:
        raise ValueError("invalid private object reference")
    return bucket, key


def _read_object(storage: Minio, object_ref: str) -> bytes:
    try:
        bucket, key = _object_parts(object_ref)
    except (ValueError, AttributeError) as exc:
        raise ProcessingFailure("SOURCE_OBJECT_REF_INVALID") from exc
    try:
        response = storage.get_object(bucket, key)
        try:
            return response.read()
        finally:
            try:
                response.close()
            finally:
                response.release_conn()
    except Exception as exc:
        raise storage_failure(exc) from exc


def _processing_event(envelope: dict, task_id: UUID, status: str, source_hash: str,
                      cv_id: UUID, cv_version_id: UUID, failure_code: str | None) -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "cv.processing.updated.v1",
        "schemaVersion": 1,
        "correlationId": envelope["correlationId"],
        "idempotencyKey": f"cv.processing.updated.v1:{cv_version_id}:{_cv_generation(envelope)}:{status}",
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "cvId": str(cv_id),
            "cvVersionId": str(cv_version_id),
            "processingTaskId": str(task_id),
            "sourceHash": source_hash,
            "status": status,
            "failureCode": failure_code,
            "processingGeneration": _cv_generation(envelope),
        },
    }


def _cv_generation(envelope: dict) -> int:
    generation = envelope.get("payload", {}).get("processingGeneration", 0)
    if isinstance(generation, bool) or not isinstance(generation, int) or not 0 <= generation <= 2**63 - 1:
        raise ValueError("Invalid CV processing generation")
    return generation


async def run() -> None:
    settings = get_settings()
    consumer = AIOKafkaConsumer(
        settings.kafka_cv_uploaded_topic,
        settings.kafka_job_submitted_topic,
        settings.kafka_application_submitted_topic,
        settings.kafka_cv_confirmed_topic,
        settings.kafka_job_confirmed_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
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
            await _handle_message(message, consumer, factory, storage, producer, settings)
    finally:
        await producer.stop()
        await consumer.stop()


async def _handle_message(message, consumer, factory, storage, producer, settings) -> None:
    try:
        envelope = _decode_envelope(message.value)
    except ValueError as exc:
        dead_letter = _invalid_message_event(message, exc)
        await producer.send_and_wait(
            settings.kafka_dead_letter_topic,
            key=f"{message.topic}:{message.partition}:{message.offset}".encode("utf-8"),
            value=dead_letter,
        )
        await consumer.commit()
        LOGGER.error(
            "Invalid AI event moved to DLQ topic=%s source_topic=%s partition=%s offset=%s",
            settings.kafka_dead_letter_topic, message.topic, message.partition, message.offset,
        )
        return
    for attempt in range(1, settings.kafka_max_processing_attempts + 1):
        final_attempt = attempt == settings.kafka_max_processing_attempts
        try:
            if envelope.get("eventType") == "cv.uploaded.v1":
                await _process_one(envelope, factory, storage, producer, settings,
                                   final_attempt=final_attempt)
            elif envelope.get("eventType") == "job.version.submitted.v1":
                await _process_job(envelope, factory, storage, producer, settings,
                                   final_attempt=final_attempt)
            elif envelope.get("eventType") == "application.submitted.v1":
                await _process_application(envelope, factory, producer, settings)
            elif envelope.get("eventType") == "cv.confirmed.v1":
                await _retry_waiting_matches(
                    envelope, factory, producer, settings,
                    cv_version_id=UUID(envelope["payload"]["cvVersionId"]),
                )
            elif envelope.get("eventType") == "job.confirmed.v1":
                await _retry_waiting_matches(
                    envelope, factory, producer, settings,
                    job_version_id=UUID(envelope["payload"]["jobVersionId"]),
                )
        except Exception as exc:
            # Do not log event contents: events can contain private object references.
            LOGGER.error("AI event processing failed attempt=%s/%s error_type=%s",
                         attempt, settings.kafka_max_processing_attempts, type(exc).__name__)
            if final_attempt:
                dead_letter = _dead_letter_event(envelope, message, exc, attempt)
                await producer.send_and_wait(settings.kafka_dead_letter_topic,
                                             key=str(envelope.get("eventId", "unknown")).encode("utf-8"),
                                             value=dead_letter)
                await consumer.commit()
                LOGGER.error("AI event moved to DLQ topic=%s source_topic=%s partition=%s offset=%s",
                             settings.kafka_dead_letter_topic, message.topic,
                             message.partition, message.offset)
                return
            await asyncio.sleep(settings.kafka_retry_backoff_seconds * attempt)
        else:
            # An acknowledgement failure must not spend processing retries or send
            # an already-completed event to DLQ. Kafka will redeliver it on restart.
            await consumer.commit()
            return


async def _process_one(envelope: dict, factory, storage: Minio,
                       producer: AIOKafkaProducer, settings, *, final_attempt: bool = True) -> None:
    if envelope.get("eventType") != "cv.uploaded.v1":
        return
    payload = envelope.get("payload", {})
    cv_id = UUID(payload["cvId"])
    cv_version_id = UUID(payload["cvVersionId"])
    owner_user_id = UUID(payload["candidateUserId"])
    object_ref = payload["objectRef"]
    source_hash = payload["sourceHash"]
    generation = _cv_generation(envelope)

    with factory() as session:
        tasks = SqlAlchemyProcessingTaskRepository(session)
        revisions = ParsedCvRevisionRepository(session)
        retry_failure = None
        existing = tasks.find_by_resource_id(cv_version_id)
        if existing and existing.processing_generation > generation:
            return
        if existing and existing.state is TaskState.COMPLETED:
            task = tasks.start_cv(cv_version_id, owner_user_id, object_ref, source_hash, generation)
            status = "PARSED"
            failure_code = None
        else:
            task = tasks.start_cv(cv_version_id, owner_user_id, object_ref, source_hash, generation)
            session.commit()
            stage = "storage"
            try:
                raw_document = _read_object(storage, object_ref)
                if hashlib.sha256(raw_document).hexdigest() != source_hash:
                    raise ProcessingFailure("CV_SOURCE_HASH_MISMATCH")
                stage = "parser"
                parsed = await asyncio.to_thread(
                    parse_pdf,
                    str(cv_version_id), source_hash, raw_document,
                    ocr_enabled=settings.ocr_enabled,
                    ocr_max_pages=settings.ocr_max_pages,
                    ocr_timeout_seconds=settings.ocr_timeout_seconds,
                    enricher=get_extractor(settings, kind="cv", session_factory=factory, context=ExtractionContext(
                        owner_user_id, cv_version_id, source_hash,
                        payload.get("externalAiConsent") is True, payload.get("externalAiPolicyVersion"),
                    )),

                )
            except Exception as exc:
                LOGGER.error("CV processing failed stage=%s error_type=%s", stage, type(exc).__name__)
                if isinstance(exc, ProcessingFailure) and exc.retryable and not final_attempt:
                    tasks.retry(task.public_id)
                    session.commit()
                    raise
                failure_code = exc.code if isinstance(exc, ProcessingFailure) else "CV_PDF_PARSE_FAILED"
                task = tasks.fail(task.public_id, failure_code)
                status = "FAILED"
                if isinstance(exc, ProcessingFailure) and exc.retryable:
                    retry_failure = exc
            else:
                # Persistence errors must roll back and reach Kafka retries; they
                # are not evidence that the uploaded PDF is invalid.
                task = tasks.complete(task.public_id, parsed)
                revisions.create(cv_version_id, owner_user_id, source_hash, parsed)

                status, failure_code = "PARSED", None
        event = _processing_event(envelope, task.public_id, status, source_hash,
                                  cv_id, cv_version_id, failure_code)
        enqueue(session, settings.kafka_cv_processing_updated_topic, str(cv_id), event)
        session.commit()
        if retry_failure is not None:
            raise retry_failure


def _job_processing_event(envelope: dict, task_id: UUID, status: str, source_hash: str,
                          job_id: UUID, job_version_id: UUID, failure_code: str | None) -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "job.processing.updated.v1",
        "schemaVersion": 1,
        "correlationId": envelope["correlationId"],
        "idempotencyKey": f"job.processing.updated.v1:{job_version_id}:{status}",
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "jobId": str(job_id), "jobVersionId": str(job_version_id),
            "processingTaskId": str(task_id), "sourceHash": source_hash,
            "status": status, "failureCode": failure_code,
        },
    }


async def _process_job(envelope: dict, factory, storage: Minio,
                       producer: AIOKafkaProducer, settings, *, final_attempt: bool = True) -> None:
    payload = envelope.get("payload", {})
    job_id = UUID(payload["jobId"])
    job_version_id = UUID(payload["jobVersionId"])
    owner_user_id = UUID(payload["recruiterUserId"])
    object_ref = payload["objectRef"]
    source_hash = payload["sourceHash"]

    with factory() as session:
        tasks = SqlAlchemyProcessingTaskRepository(session)
        revisions = ParsedJdRevisionRepository(session)
        retry_failure = None
        existing = tasks.find_by_resource_id(job_version_id)
        if existing and existing.state is TaskState.COMPLETED:
            task = existing
            status, failure_code = "PARSED", None
        else:
            task = tasks.start_jd(job_version_id, owner_user_id, object_ref, source_hash)
            session.commit()
            try:
                snapshot = json.loads(_read_object(storage, object_ref))
                if not isinstance(snapshot, dict) or any(
                    not isinstance(snapshot.get(field), str)
                    for field in ("title", "description", "requirementsText", "sourceHash")
                ):
                    raise ProcessingFailure("JD_SOURCE_INVALID")
                if snapshot.get("sourceHash") != source_hash:
                    raise ProcessingFailure("JD_SOURCE_HASH_MISMATCH")
                parsed = await asyncio.to_thread(parse_jd, str(job_version_id), source_hash, snapshot["title"],
                                  snapshot["description"], snapshot["requirementsText"],
                                  enricher=get_extractor(settings, kind="jd", session_factory=factory, context=ExtractionContext(
                                      owner_user_id, job_version_id, source_hash,
                                      payload.get("externalAiConsent") is True, payload.get("externalAiPolicyVersion"),
                                  )))
            except Exception as exc:
                LOGGER.error("JD processing failed error_type=%s", type(exc).__name__)
                if isinstance(exc, ProcessingFailure) and exc.retryable and not final_attempt:
                    tasks.retry(task.public_id)
                    session.commit()
                    raise
                failure_code = exc.code if isinstance(exc, ProcessingFailure) else "JD_PARSE_FAILED"
                task = tasks.fail(task.public_id, failure_code)
                status = "FAILED"
                if isinstance(exc, ProcessingFailure) and exc.retryable:
                    retry_failure = exc
            else:
                task = tasks.complete(task.public_id, parsed)
                revisions.upsert(job_id, job_version_id, owner_user_id, source_hash, parsed)

                status, failure_code = "PARSED", None
        event = _job_processing_event(envelope, task.public_id, status, source_hash,
                                      job_id, job_version_id, failure_code)
        enqueue(session, settings.kafka_job_processing_updated_topic, str(job_id), event)
        session.commit()
        if retry_failure is not None:
            raise retry_failure


def _matching_event(envelope: dict, result, application_id: UUID,
                    cv_version_id: UUID, job_version_id: UUID) -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "matching.completed.v1",
        "schemaVersion": 1,
        "correlationId": envelope["correlationId"],
        "idempotencyKey": (
            f"matching.completed.v1:{application_id}:"
            f"{result.algorithm_version}:{result.taxonomy_version}:{result.public_id}"
        ),
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
            "algorithmVersion": result.algorithm_version,
            "taxonomyVersion": result.taxonomy_version,
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
        if existing and not _input_unavailable(existing.status, existing.quality_flags) \
                and existing.cv_version_id == cv_version_id \
                and existing.job_version_id == job_version_id \
                and existing.algorithm_version == ALGORITHM_VERSION:
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
                    cv_revision_id=cv_revision.public_id, jd_revision_id=jd_revision.public_id,

                )
        event = _matching_event(envelope, result, application_id, cv_version_id, job_version_id)
        enqueue(session, settings.kafka_matching_completed_topic, str(application_id), event)
        session.commit()


async def _retry_waiting_matches(envelope: dict, factory,
                                 producer: AIOKafkaProducer, settings, *,
                                 cv_version_id: UUID | None = None,
                                 job_version_id: UUID | None = None) -> None:
    with factory() as session:
        results = MatchingResultRepository(session)
        waiting = results.find_input_unavailable(
            cv_version_id=cv_version_id, job_version_id=job_version_id,
        )

    for prior in waiting:
        with factory() as session:
            cv_revision = ParsedCvRevisionRepository(session).find_confirmed(prior.cv_version_id)
            jd_revision = ParsedJdRevisionRepository(session).find_confirmed(prior.job_version_id)
            if cv_revision is None or jd_revision is None:
                continue

            computed = compute_match(cv_revision.payload, jd_revision.payload)
            result = MatchingResultRepository(session).save(
                prior.application_id, prior.cv_version_id, prior.job_version_id,
                computed.status, computed.final_score, computed.quality_flags,
                computed.components, computed.claims,
                cv_revision_id=cv_revision.public_id, jd_revision_id=jd_revision.public_id,

            )
            event = _matching_event(
                envelope, result, prior.application_id,
                prior.cv_version_id, prior.job_version_id,
            )
            enqueue(session, settings.kafka_matching_completed_topic, str(prior.application_id), event)
            session.commit()


if __name__ == "__main__":
    asyncio.run(run())
