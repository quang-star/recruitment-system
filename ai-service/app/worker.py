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
from app.shared.config import get_settings
from app.task.domain import TaskState
from app.task.persistence import SqlAlchemyProcessingTaskRepository


LOGGER = logging.getLogger(__name__)


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
            try:
                await _process_one(envelope, factory, storage, producer, settings)
                await consumer.commit()
            except Exception as exc:
                # Do not log event contents: the event contains private object references.
                LOGGER.error("CV upload event failed error_type=%s", type(exc).__name__)
                await asyncio.sleep(2)
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


if __name__ == "__main__":
    asyncio.run(run())
