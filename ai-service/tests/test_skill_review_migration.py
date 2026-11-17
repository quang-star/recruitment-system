"""Forward migration preserves immutable snapshots and unknown legacy audit fields."""
import importlib.util
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, Integer, JSON, MetaData, String, Table, Uuid, create_engine, select


def test_review_migration_backfills_live_projection_without_inventing_history():
    path = Path(__file__).parents[1] / "migrations/versions/0015_skill_review_metadata.py"
    spec = importlib.util.spec_from_file_location("skill_review_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    metadata = MetaData()
    catalog = Table("skill_catalog", metadata, Column("id", Integer, primary_key=True),
                    Column("version", Integer, nullable=False), Column("skills", JSON, nullable=False))
    history = Table("skill_catalog_history", metadata, Column("id", Uuid, primary_key=True),
                    Column("before_state", JSON), Column("after_state", JSON, nullable=False))
    snapshots = Table("taxonomy_versions", metadata, Column("semantic_version", String(32), primary_key=True),
                      Column("payload", JSON), Column("source_hash", String(64), nullable=False))
    metadata.create_all(engine)
    old_skill = {"stableId": str(uuid4()), "canonicalName": "Kỹ năng mới", "normalizedName": "kỹ năng mới",
                 "type": "tool", "category": "other", "aliases": [], "relations": [], "status": "ACTIVE"}
    old_payload = {"semanticVersion": "1.0.4", "status": "ACTIVE", "skills": [deepcopy(old_skill)]}
    history_id = uuid4()
    with engine.begin() as connection:
        connection.execute(catalog.insert().values(id=1, version=4, skills=[old_skill]))
        connection.execute(history.insert().values(id=history_id, before_state=None, after_state=old_skill))
        connection.execute(snapshots.insert().values(semantic_version="1.0.4", payload=old_payload, source_hash="a" * 64))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        migrated = MetaData()
        migrated.reflect(connection)
        live = connection.execute(select(migrated.tables["skill_catalog"])).mappings().one()
        assert live["version"] == live["published_version"] == 4
        assert live["skills"][0] == old_skill
        old_audit = connection.execute(select(migrated.tables["skill_catalog_history"])).mappings().one()
        assert old_audit["after_state"] == old_skill and old_audit["before_state"] is None
        assert old_audit["reason"] is None and old_audit["correlation_id"] is None
        snapshot = connection.execute(select(snapshots)).mappings().one()
        assert snapshot["payload"] == old_payload and snapshot["source_hash"] == "a" * 64
    engine.dispose()
