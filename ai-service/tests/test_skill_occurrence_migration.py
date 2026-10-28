"""Additive source ledger migration preserves historical payloads and validates identity."""
import importlib.util
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import Column, Integer, JSON, MetaData, Table, create_engine, func, select
from sqlalchemy.exc import IntegrityError


@pytest.fixture
def migrated():
    path = Path(__file__).parents[1] / "migrations/versions/0016_skill_source_occurrences.py"
    spec = importlib.util.spec_from_file_location("skill_occurrence_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    metadata = MetaData()
    legacy_columns = {"parsed_cv_revisions": "payload", "parsed_jd_revisions": "payload", "skill_catalog": "skills",
                      "skill_catalog_history": "after_state", "taxonomy_versions": "payload"}
    legacy = {name: Table(name, metadata, Column("id", Integer, primary_key=True), Column(column, JSON, nullable=False))
              for name, column in legacy_columns.items()}
    metadata.create_all(engine)
    with engine.begin() as connection:
        for name, table in legacy.items():
            connection.execute(table.insert().values(id=1, **{legacy_columns[name]: {"legacy": name, "version": 1}}))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
    tables = MetaData()
    tables.reflect(engine)
    yield engine, tables.tables
    engine.dispose()


def occurrence():
    # SQLite reflects UUID storage as CHAR; use the serialized representation.
    return dict(id=uuid4().hex, identity_hash=uuid4().hex * 2, skill_id=uuid4().hex, source_kind="CV", source_version_id=uuid4().hex,
                normalized_term="newframeworkx", raw_term="NewFrameworkX", field_role="CV.skills",
                first_revision_id=uuid4().hex, latest_revision_id=uuid4().hex, latest_revision_number=1, active=True,
                provenance="EXTRACTED", normalization_status="PENDING", confidence=0.7, evidence_refs=[], safe_context={},
                first_seen=datetime.now(UTC), last_seen=datetime.now(UTC))


def test_forward_migration_keeps_old_payloads_and_does_not_invent_occurrences(migrated):
    engine, tables = migrated
    with engine.connect() as connection:
        for name, column in {"parsed_cv_revisions": "payload", "parsed_jd_revisions": "payload", "skill_catalog": "skills",
                             "skill_catalog_history": "after_state", "taxonomy_versions": "payload"}.items():
            assert connection.scalar(select(tables[name].c[column])) == {"legacy": name, "version": 1}
        assert connection.scalar(select(func.count()).select_from(tables["skill_source_occurrences"])) == 0
        assert connection.scalar(select(func.count()).select_from(tables["skill_occurrence_revisions"])) == 0


@pytest.mark.parametrize("invalid", [{"source_kind": "XX"}, {"field_role": "cv.rawText"},
                                    {"latest_revision_number": 0}, {"confidence": 1.1},
                                    {"provenance": "RAW"}, {"normalization_status": "GUESSED"}])
def test_occurrence_migration_enforces_domain_checks(migrated, invalid):
    engine, tables = migrated
    values = occurrence()
    values.update(invalid)
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(tables["skill_source_occurrences"].insert().values(**values))


def test_occurrence_migration_prevents_source_role_term_and_revision_retry_duplicates(migrated):
    engine, tables = migrated
    values = occurrence()
    with engine.begin() as connection:
        connection.execute(tables["skill_source_occurrences"].insert().values(**values))
    duplicate = {**values, "id": uuid4().hex, "identity_hash": uuid4().hex * 2}
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(tables["skill_source_occurrences"].insert().values(**duplicate))
    link = dict(occurrence_id=values["id"], revision_id=values["latest_revision_id"], revision_number=1,
                normalization_status="PENDING", provenance="EXTRACTED", confidence=None, evidence_refs=[], safe_context={},
                observed_at=datetime.now(UTC))
    with engine.begin() as connection:
        connection.execute(tables["skill_occurrence_revisions"].insert().values(**link))
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(tables["skill_occurrence_revisions"].insert().values(**link))
