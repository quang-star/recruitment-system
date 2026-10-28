"""Concurrency gate against the disposable PostgreSQL configured by the QA harness."""
from identity_fixtures import new_id
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.shared.api import ApiContractError
from app.taxonomy.catalog import SkillCatalogHistory, SkillCatalogRecord, TaxonomyVersionRecord, change, head, seed_skills


@pytest.mark.skipif(not os.getenv("OUTBOX_TEST_DB_URL"), reason="requires isolated PostgreSQL")
def test_concurrent_reviews_accept_only_one_expected_catalog_version():
    base = create_engine(os.environ["OUTBOX_TEST_DB_URL"])
    schema = "taxonomy_review_" + uuid4().hex
    with base.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    engine = base.execution_options(schema_translate_map={None: schema})
    for model in (SkillCatalogRecord, SkillCatalogHistory, TaxonomyVersionRecord):
        model.__table__.create(engine)
    with Session(engine) as session:
        session.add(SkillCatalogRecord(id=1, version=0, skills=seed_skills()))
        session.commit()
        proposed = change(session, new_id(), 0, action="PROPOSE", name="ConcurrentX", reason="Synthetic JD term")
        skill_id = int(proposed["skill"]["stableId"])
        session.commit()
    barrier = Barrier(2)

    def attempt(action):
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                result = change(session, new_id(), 1, action=action, skill_id=skill_id, reason="Concurrent review")
                session.commit()
                return result["skill"]["status"]
            except ApiContractError as error:
                session.rollback()
                return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ["APPROVE", "DEFER"]))
    assert results.count("SKILL_CATALOG_CONFLICT") == 1
    winner = next(value for value in results if value != "SKILL_CATALOG_CONFLICT")
    with Session(engine) as session:
        catalog = head(session)
        assert catalog.version == 2 and catalog.published_version == (2 if winner == "ACTIVE" else 0)
        assert len(session.scalars(select(SkillCatalogHistory)).all()) == 2
        publications = session.scalars(select(TaxonomyVersionRecord)).all()
        assert len(publications) == (1 if winner == "ACTIVE" else 0)
    # The harness discards the whole temporary database; no destructive cleanup
    # command is needed in the test.
    base.dispose()
