import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.outbox import OutboxEvent, enqueue, publish_one


def factory():
    engine = create_engine("sqlite://")
    OutboxEvent.__table__.create(engine)
    return sessionmaker(engine, expire_on_commit=False)


def test_rollback_removes_queued_event():
    sessions = factory()
    with sessions() as session:
        enqueue(session, "test", "key", {"eventId": str(uuid4())})
        session.rollback()
    with sessions() as session:
        assert session.scalar(select(OutboxEvent)) is None


def test_failure_survives_new_session_and_retry_preserves_event_id():
    sessions = factory()
    event = {"eventId": str(uuid4()), "payload": {"status": "CONFIRMED"}}
    with sessions.begin() as session:
        enqueue(session, "cv.confirmed.v2", "cv-id", event)
    failed = AsyncMock()
    failed.send_and_wait.side_effect = TimeoutError("private broker detail")
    assert asyncio.run(publish_one(sessions, failed))
    with sessions.begin() as session:
        row = session.scalar(select(OutboxEvent))
        assert row.published_at is None
        assert row.attempts == 1
        assert row.last_error == "TimeoutError"
        row.available_at = datetime.now(UTC) - timedelta(seconds=1)
    recovered = AsyncMock()
    assert asyncio.run(publish_one(sessions, recovered))
    assert recovered.send_and_wait.call_args.kwargs["value"] == event
    assert not asyncio.run(publish_one(sessions, recovered))
    with sessions() as session:
        row = session.scalar(select(OutboxEvent))
        assert row.attempts == 2
        assert row.published_at is not None


def test_cancel_before_ack_rolls_back_claim():
    sessions = factory()
    with sessions.begin() as session:
        enqueue(session, "test", "key", {"eventId": str(uuid4())})
    producer = AsyncMock()
    producer.send_and_wait.side_effect = asyncio.CancelledError()
    try:
        asyncio.run(publish_one(sessions, producer))
    except asyncio.CancelledError:
        pass
    with sessions() as session:
        row = session.scalar(select(OutboxEvent))
        assert row.published_at is None
        assert row.attempts == 0
