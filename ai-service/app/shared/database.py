from collections.abc import Generator
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import BigInteger, Integer, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.shared.config import get_settings


class Base(DeclarativeBase):
    pass


# SQLite requires the literal INTEGER type for generated row identities.
BUSINESS_ID = BigInteger().with_variant(Integer, "sqlite")


def utc_time(value: datetime) -> datetime:
    """Normalize legacy naive local or aware DB timestamps to UTC."""
    return value.astimezone(UTC)


def monotonic_update_time(*floors: datetime | None, candidate: datetime | None = None) -> datetime:
    """Ensure updated_at never moves backward relative to persisted timestamps under clock skew."""
    now = utc_time(candidate) if candidate is not None else datetime.now(UTC)
    bounds = [utc_time(value) for value in floors if value is not None]
    return max([now, *bounds])


def stored_time(session: Session, value: datetime) -> datetime:
    """Format a UTC instant for PostgreSQL TIMESTAMPTZ or legacy naive local SQLite columns."""
    bind = session.get_bind() if hasattr(session, "get_bind") else None
    if bind is not None and bind.dialect.name == "sqlite":
        # Keep the legacy SQLite convention so old and new rows remain readable.
        return value.astimezone().replace(tzinfo=None)
    return value.astimezone(UTC)


@lru_cache
def _session_factory(database_url: str) -> sessionmaker[Session]:
    engine = create_engine(database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    factory = _session_factory(get_settings().db_url)
    with factory() as session:
        yield session
