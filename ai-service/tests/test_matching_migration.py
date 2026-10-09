import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def test_input_revision_migration_preserves_existing_results():
    path = Path(__file__).parents[1] / "migrations/versions/0008_matching_input_revisions.py"
    spec = importlib.util.spec_from_file_location("matching_input_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE matching_results (id INTEGER PRIMARY KEY, score FLOAT)"))
        connection.execute(text("INSERT INTO matching_results VALUES (1, 75)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        result = connection.execute(text("SELECT * FROM matching_results")).mappings().one()
        assert dict(result) == {"id": 1, "score": 75, "cv_revision_id": None,
                                "jd_revision_id": None, "as_of_month": None}
