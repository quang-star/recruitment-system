from identity_fixtures import new_id
from copy import deepcopy
from datetime import datetime
import importlib.util
import os
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.jd.repository import ParsedJdHeadRecord, ParsedJdRevisionRecord, ParsedJdRevisionRepository


def migration():
    path = Path(__file__).parents[1] / "migrations/versions/0017_preserve_superseded_jd_confirmation.py"
    spec = importlib.util.spec_from_file_location("jd_confirmation_history_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_forward_migration_keeps_every_previous_row_and_superseded_confirmation_history():
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    table = sa.Table("parsed_jd_revisions", metadata,
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("status", sa.String(20)),
        sa.Column("confirmed_by", sa.String(36)), sa.Column("confirmed_at", sa.DateTime),
        sa.Column("payload", sa.JSON),
        sa.CheckConstraint(migration().PREVIOUS, name=migration().CONSTRAINT))
    metadata.create_all(engine)
    actor = str(new_id())
    with engine.begin() as connection:
        connection.execute(table.insert(), [
            {"id": 1, "status": "CONFIRMED", "confirmed_by": actor, "confirmed_at": datetime(2026, 10, 2), "payload": {"skills": ["Java"]}},
            {"id": 2, "status": "SUPERSEDED", "confirmed_by": None, "confirmed_at": None, "payload": {"legacy": True}},
            # The old constraint also permitted a partial legacy pair. Keep it
            # truthfully instead of fabricating or clearing audit metadata.
            {"id": 3, "status": "PARSED", "confirmed_by": actor, "confirmed_at": None, "payload": {"legacy": "partial"}},
        ])
        before = connection.execute(sa.select(table).order_by(table.c.id)).all()
        with Operations.context(MigrationContext.configure(connection)):
            migration().upgrade()
        assert connection.execute(sa.select(table).order_by(table.c.id)).all() == before
        connection.execute(table.update().where(table.c.id == 1).values(status="SUPERSEDED"))
        preserved = connection.execute(sa.select(table).where(table.c.id == 1)).one()
        assert preserved.confirmed_by == actor and preserved.confirmed_at == datetime(2026, 10, 2)
        assert preserved.payload == {"skills": ["Java"]}
        with Operations.context(MigrationContext.configure(connection)), pytest.raises(RuntimeError, match="confirmation history"):
            migration().downgrade()
        assert connection.execute(sa.select(table).where(table.c.id == 1)).one() == preserved
    engine.dispose()


@pytest.mark.parametrize("status,actor,at", [("CONFIRMED", None, None), ("PARSED", str(new_id()), datetime(2026, 10, 2))])
def test_new_constraint_retains_confirmation_validation(status, actor, at):
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    table = sa.Table("parsed_jd_revisions", metadata,
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("status", sa.String(20)),
        sa.Column("confirmed_by", sa.String(36)), sa.Column("confirmed_at", sa.DateTime),
        sa.CheckConstraint(f"({migration().PREVIOUS}) OR status = 'SUPERSEDED'", name=migration().CONSTRAINT))
    metadata.create_all(engine)
    with engine.begin() as connection, pytest.raises(sa.exc.IntegrityError):
        connection.execute(table.insert().values(id=1, status=status, confirmed_by=actor, confirmed_at=at))
    engine.dispose()


@pytest.mark.skipif(not os.getenv("WORKER_TEST_DB_URL"), reason="requires isolated PostgreSQL")
def test_real_postgresql_new_jd_confirmation_keeps_prior_confirmation_and_payload():
    # Use the actual migrated table/check constraint, not metadata-created test
    # tables that omit production confirmation constraints.
    engine = sa.create_engine(os.environ["WORKER_TEST_DB_URL"])
    job, version, owner = new_id(), new_id(), new_id()
    with Session(engine) as session:
        repository = ParsedJdRevisionRepository(session)
        first = repository.upsert(job, version, owner, "a" * 64, {
            "requirements": {"requiredSkills": [{"raw": "Java", "confirmedByRecruiter": False}], "preferredSkills": []}})
        confirmed = repository.confirm(version, owner, first.id, owner)
        session.commit()
        first_payload = deepcopy(confirmed.payload)
        first_at = confirmed.confirmed_at
        edited = repository.create_revision(job, version, owner, "a" * 64, {
            "requirements": {"requiredSkills": [{"raw": "Java edited", "confirmedByRecruiter": False}], "preferredSkills": []}}, confirmed.id)
        latest = repository.confirm(version, owner, edited.id, owner)
        session.commit()
        old = session.scalar(sa.select(ParsedJdRevisionRecord).where(ParsedJdRevisionRecord.id == first.id))
        new = session.scalar(sa.select(ParsedJdRevisionRecord).where(ParsedJdRevisionRecord.id == edited.id))
        head = session.get(ParsedJdHeadRecord, version)
        assert old.status == "SUPERSEDED" and old.confirmed_by == owner and old.confirmed_at == first_at
        assert old.payload == first_payload and old.source_hash == "a" * 64
        assert latest.status == "CONFIRMED" and head.revision_id == new.id and head.confirmed_by == owner
        repository.confirm(version, owner, edited.id, owner)
        session.commit()
        assert session.scalar(sa.select(sa.func.count()).select_from(ParsedJdRevisionRecord).where(
            ParsedJdRevisionRecord.job_version_id == version)) == 2
    engine.dispose()
