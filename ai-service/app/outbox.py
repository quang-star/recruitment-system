"""Transactional publication; delivery is at least once, with stable event IDs."""
import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from aiokafka import AIOKafkaProducer
from sqlalchemy import DateTime, Integer, JSON, String, Uuid, select
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database import Base, _session_factory
from app.shared.config import get_settings


class OutboxEvent(Base):
    __tablename__ = "ai_outbox_events"
    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    topic: Mapped[str] = mapped_column(String(255))
    message_key: Mapped[str] = mapped_column(String(255))
    envelope: Mapped[dict] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(100), nullable=True)


def enqueue(session, topic: str, key: str, envelope: dict) -> None:
    now = datetime.now(UTC)
    session.add(OutboxEvent(event_id=UUID(envelope["eventId"]), topic=topic,
                            message_key=key, envelope=envelope,
                            available_at=now, created_at=now))
    session.flush()


async def publish_one(factory, producer) -> bool:
    # PostgreSQL row locks act as the claim. Rollback/connection loss releases
    # them automatically; no persistent lease can strand a crashed worker.
    with factory() as session, session.begin():
        row = session.scalar(select(OutboxEvent).where(
            OutboxEvent.published_at.is_(None),
            OutboxEvent.available_at <= datetime.now(UTC),
        ).order_by(OutboxEvent.created_at, OutboxEvent.event_id)
            .with_for_update(skip_locked=True).limit(1))
        if row is None:
            return False
        row.attempts += 1
        try:
            await asyncio.wait_for(producer.send_and_wait(
                row.topic, key=row.message_key.encode("utf-8"), value=row.envelope,
            ), timeout=30)
        except Exception as exc:
            row.last_error = type(exc).__name__[:100]
            row.available_at = datetime.now(UTC) + timedelta(seconds=min(300, 2 ** min(row.attempts, 8)))
        else:
            row.published_at = datetime.now(UTC)
            row.last_error = None
    return True


async def run() -> None:
    settings = get_settings()
    factory = _session_factory(settings.db_url)
    producer = AIOKafkaProducer(bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda value: json.dumps(value).encode("utf-8"))
    try:
        await producer.start()
        while True:
            try:
                if not await publish_one(factory, producer):
                    await asyncio.sleep(1)
            except Exception as exc:
                logging.error("Outbox database failure error_type=%s", type(exc).__name__)
                await asyncio.sleep(5)
    finally:
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(run())
