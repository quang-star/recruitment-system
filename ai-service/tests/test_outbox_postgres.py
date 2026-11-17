"""Opt-in against an isolated disposable database, never the application DB."""
from uuid import UUID, uuid4
import asyncio
import os
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from app.outbox import OutboxEvent, enqueue, publish_one


@pytest.mark.skipif(not os.getenv("OUTBOX_TEST_DB_URL"), reason="requires isolated PostgreSQL")
def test_postgres_locked_claim_retry_and_delivery():
    engine = create_engine(os.environ["OUTBOX_TEST_DB_URL"])
    sessions = sessionmaker(engine, expire_on_commit=False)
    first, second = str(uuid4()), str(uuid4())
    with sessions.begin() as session:
        enqueue(session, "test", "first", {"eventId": first})
        enqueue(session, "test", "second", {"eventId": second})
    # Simulate another relay holding the first claim. SKIP LOCKED must still
    # deliver the second row without waiting or duplicating the first.
    with sessions() as holder, holder.begin():
        holder.scalar(select(OutboxEvent).where(OutboxEvent.event_id == UUID(first)).with_for_update())
        producer = AsyncMock()
        assert asyncio.run(publish_one(sessions, producer))
        assert producer.send_and_wait.call_args.kwargs["value"]["eventId"] == second
    failed = AsyncMock()
    failed.send_and_wait.side_effect = ConnectionError()
    asyncio.run(publish_one(sessions, failed))
    with sessions.begin() as session:
        row = session.get(OutboxEvent, UUID(first))
        assert row.published_at is None
        assert row.attempts == 1
        row.available_at = datetime.now(UTC) - timedelta(seconds=1)
    recovered = AsyncMock()
    asyncio.run(publish_one(sessions, recovered))
    assert recovered.send_and_wait.call_args.kwargs["value"]["eventId"] == first
    assert not asyncio.run(publish_one(sessions, recovered))
    engine.dispose()
