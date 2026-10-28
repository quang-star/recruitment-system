from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import BigInteger, Integer, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.shared.config import get_settings


class Base(DeclarativeBase):
    pass


# SQLite requires the literal INTEGER type for generated row identities.
BUSINESS_ID = BigInteger().with_variant(Integer, "sqlite")


@lru_cache
def _session_factory(database_url: str) -> sessionmaker[Session]:
    engine = create_engine(database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    factory = _session_factory(get_settings().db_url)
    with factory() as session:
        yield session
