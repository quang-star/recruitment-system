"""Locks, leases and atomic effects against the actual migrated disposable schema."""
from identity_fixtures import new_id
import asyncio
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import hashlib
import importlib.util
import os
from pathlib import Path
from threading import Barrier
from uuid import uuid4
import json
import re

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker

from app.cv.parser import parse_pdf
from app.cv.repository import ParsedCvRevisionRecord, ParsedCvRevisionRepository
from app.reprocessing.impact import preview
from app.reprocessing.models import CreateBatchRequest, ImpactRequest, ReprocessingAttempt, ReprocessingItem
from app.reprocessing.repository import batch_record, claim_one, create_batch, public_batch
from app.reprocessing.service import ReprocessingService
from app.shared.config import Settings
from app.shared.privacy import process_privacy_event
from app.task.persistence import SqlAlchemyProcessingTaskRepository
from test_reprocessing import Reader

pytestmark = pytest.mark.skipif(not os.getenv("OUTBOX_TEST_DB_URL"), reason="requires isolated migrated PostgreSQL")


@pytest.fixture
def pg_case():
    engine = create_engine(os.environ["OUTBOX_TEST_DB_URL"])
    factory = sessionmaker(engine, expire_on_commit=False)
    version, owner, actor = new_id(), new_id(), new_id()
    raw = (Path(__file__).parent / "fixtures/minimal-cv.pdf").read_bytes()
    source_hash = hashlib.sha256(raw).hexdigest()
    parsed = parse_pdf(str(version), source_hash, raw, ocr_enabled=False)
    parsed["document"]["parserVersion"] = "synthetic-previous-processor"
    with factory() as session:
        assert session.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0020"
        revision = ParsedCvRevisionRepository(session).create(version, owner, source_hash, parsed)
        old = ParsedCvRevisionRepository(session).confirm(version, owner, revision.id, owner)
        tasks = SqlAlchemyProcessingTaskRepository(session)
        tasks.complete(tasks.start_cv(version, owner, "synthetic-reprocess/cv.pdf", source_hash).id, parsed)
        session.commit()
        settings = Settings(db_url=os.environ["OUTBOX_TEST_DB_URL"], auth_jwks_uri="https://synthetic.invalid/jwks",
                            auth_jwt_issuer="synthetic", auth_jwt_audience="synthetic", ocr_enabled=False)
        request = ImpactRequest(operation="PARSE_CV", resourceIds=[version], asOfMonth="2026-10")
        impact, _ = preview(session, settings, request)
        body = CreateBatchRequest(**request.model_dump(), reason="Synthetic PostgreSQL two-worker gate", previewHash=impact["previewHash"])
        batch = create_batch(session, settings, body, actor=actor, correlation=uuid4(), idempotency_key=uuid4().hex)
        session.commit()
    service = ReprocessingService(factory, settings, Reader(), lambda _: raw)
    yield factory, service, batch.id, actor, version, old
    # The QA harness removes only its own labelled tmpfs container.
    engine.dispose()


def test_two_workers_claim_and_materialize_exactly_once_on_migrated_postgres(pg_case):
    factory, service, identity, actor, version, old = pg_case
    barrier = Barrier(2)

    def worker():
        barrier.wait(timeout=10)
        return asyncio.run(service.step(identity, actor, new_id(), "Bearer synthetic-only"))

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: worker(), range(2)))
    assert sum(result["claimed"] for result in results) == 1
    with factory() as session:
        rows = session.scalars(select(ParsedCvRevisionRecord).where(ParsedCvRevisionRecord.cv_version_id == version)
                               .order_by(ParsedCvRevisionRecord.revision_number)).all()
        assert len(rows) == 2 and rows[0].payload == old.payload
        assert rows[1].status == "PARSED" and rows[1].supersedes_revision_id == old.id
        assert ParsedCvRevisionRepository(session).find_confirmed(version).id == old.id
        item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.batch_id == identity))
        assert session.scalar(select(func.count()).select_from(ReprocessingAttempt).where(ReprocessingAttempt.item_id == item.id)) == 1
        assert public_batch(session, batch_record(session, identity))["checkpoint"] == 1
        # The production check constraint is present, not a metadata.create_all substitute.
        checks = session.execute(text("SELECT conname FROM pg_constraint WHERE conrelid='reprocessing_items'::regclass AND contype='c'")).scalars().all()
        assert "ck_reprocessing_lease" in checks and "ck_reprocessing_item_bounds" in checks


def test_expired_worker_cannot_overwrite_reclaimed_postgres_effect(pg_case):
    factory, service, identity, actor, version, _ = pg_case
    with factory() as session:
        first = claim_one(session, identity, actor=actor, correlation=uuid4(), lease_seconds=120)
        item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.batch_id == identity))
        item.lease_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    with factory() as session:
        second = claim_one(session, identity, actor=actor, correlation=uuid4(), lease_seconds=120)
        session.commit()
    assert first and second and second.attempt == 2
    barrier = Barrier(2)

    def finish(claim):
        barrier.wait(timeout=10)
        asyncio.run(service.execute(claim, "Bearer synthetic-only", uuid4()))

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(finish, [first, second]))
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord).where(
            ParsedCvRevisionRecord.cv_version_id == version)) == 2
        item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.batch_id == identity))
        outcomes = session.scalars(select(ReprocessingAttempt.outcome).where(ReprocessingAttempt.item_id == item.id)
                                  .order_by(ReprocessingAttempt.number)).all()
        assert outcomes == ["LEASE_EXPIRED", "COMPLETED"]


def test_delete_during_postgres_processing_scrubs_and_prevents_late_revision(pg_case):
    factory, service, identity, actor, version, _ = pg_case
    original = service.read_object

    def erase_during_read(ref):
        raw = original(ref)
        process_privacy_event({"eventType": "cv.deleted.v2", "payload": {"cvVersionId": str(version), "cvId": str(new_id())}}, factory)
        return raw

    service.read_object = erase_during_read
    result = asyncio.run(service.step(identity, actor, new_id(), "Bearer synthetic-only"))
    assert result["batch"]["items"][0]["state"] == "SKIPPED"
    assert result["batch"]["items"][0]["resourceId"] is None
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ParsedCvRevisionRecord).where(
            ParsedCvRevisionRecord.cv_version_id == version)) == 0
        item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.batch_id == identity))
        assert item.snapshot is None and item.current_hash is None and item.effect_key is None and item.output_id is None


def test_migration_refuses_destructive_downgrade_after_lineage_without_modifying_rows(pg_case, monkeypatch):
    factory, _, identity, _, _, _ = pg_case
    path = Path(__file__).parents[1] / "migrations/versions/0018_controlled_reprocessing.py"
    spec = importlib.util.spec_from_file_location("reprocessing_migration_0018", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with factory() as session:
        before = deepcopy(public_batch(session, batch_record(session, identity)))
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(session.connection())))
        with pytest.raises(RuntimeError, match="Cannot downgrade"):
            migration.downgrade()
        assert public_batch(session, batch_record(session, identity)) == before


def test_forward_migration_leaves_legacy_payload_and_confirmation_fields_and_unknown_lineage_unchanged(pg_case, monkeypatch):
    factory, _, _, _, _, _ = pg_case
    path = Path(__file__).parents[1] / "migrations/versions/0018_controlled_reprocessing.py"
    spec = importlib.util.spec_from_file_location("legacy_reprocessing_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    schema = "legacy_reprocessing_" + uuid4().hex
    additions = {"supersedes_revision_id", "reprocess_effect_key", "result_generation", "supersedes_matching_result_id", "generation"}
    # Copy only the pre-0018 column structure, never production rows. Run the
    # actual forward migration against this isolated legacy-shaped schema.
    with factory() as session:
        connection = session.connection()
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        for table in ("parsed_cv_revisions", "parsed_jd_revisions", "matching_results", "matching_heads"):
            columns = connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=:table ORDER BY ordinal_position"),
                                         {"table": table}).scalars().all()
            columns = [name for name in columns if name not in additions]
            assert all(re.fullmatch(r"[a-z_]+", name) for name in columns)
            fields = ",".join('"' + name + '"' for name in columns)
            connection.execute(text(f'CREATE TABLE "{schema}"."{table}" AS SELECT {fields} FROM public."{table}" WITH NO DATA'))
        # Reconstruct legacy UUID references from the numeric current schema.
        # CREATE TABLE AS above copied columns only and carries no current rows.
        for table in ("parsed_cv_revisions", "parsed_jd_revisions", "matching_results"):
            connection.execute(text(f'ALTER TABLE "{schema}"."{table}" ADD COLUMN public_id UUID'))
        for table in ("parsed_cv_revisions", "parsed_jd_revisions", "matching_results", "matching_heads"):
            columns = connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_schema=:schema AND table_name=:table"), {"schema": schema, "table": table}).scalars().all()
            for column in columns:
                if column == "confirmed_by" or column.endswith("_id") and column not in {"public_id", "revision_id", "result_id"}:
                    connection.execute(text(f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{column}" TYPE UUID USING NULL::uuid'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
        ids = [uuid4() for _ in range(7)]
        now = datetime.now(UTC)
        connection.execute(text("INSERT INTO parsed_cv_revisions(id,public_id,cv_version_id,owner_user_id,revision_number,source_hash,payload,status,version,created_at,updated_at) "
                                "VALUES(1,:id,:source,:owner,1,:hash,CAST(:payload AS JSON),'CONFIRMED',7,:now,:now)"),
                           {"id": ids[0], "source": ids[1], "owner": ids[2], "hash": "c" * 64,
                            "payload": json.dumps({"synthetic": "unchanged CV history"}), "now": now})
        connection.execute(text("INSERT INTO parsed_jd_revisions(id,public_id,job_id,job_version_id,owner_user_id,revision_number,source_hash,payload,status,version,created_at,updated_at,confirmed_by,confirmed_at) "
                                "VALUES(1,:id,:job,:source,:owner,1,:hash,CAST(:payload AS JSON),'SUPERSEDED',9,:now,:now,:owner,:now)"),
                           {"id": ids[3], "job": ids[4], "source": ids[5], "owner": ids[2], "hash": "d" * 64,
                            "payload": json.dumps({"synthetic": "unchanged JD confirmation"}), "now": now})
        connection.execute(text("INSERT INTO matching_results(id,public_id,application_id,cv_version_id,job_version_id,status,final_score,quality_flags,components,claims,algorithm_version,taxonomy_version,created_at) "
                                "VALUES(1,:id,:app,:cv,:jd,'COMPLETED',72,'[]','[]','[]','legacy-algorithm','legacy-taxonomy',:now)"),
                           {"id": ids[6], "app": ids[4], "cv": ids[1], "jd": ids[5], "now": now})
        connection.execute(text("INSERT INTO matching_heads(application_id,result_id,updated_at) VALUES(:app,1,:now)"), {"app": ids[4], "now": now})
        before = {table: connection.execute(text(f'SELECT * FROM "{table}"')).mappings().one()
                  for table in ("parsed_cv_revisions", "parsed_jd_revisions", "matching_results", "matching_heads")}
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        for table, previous in before.items():
            after = connection.execute(text(f'SELECT * FROM "{table}"')).mappings().one()
            assert {key: after[key] for key in previous} == dict(previous)
        assert connection.execute(text("SELECT result_generation, supersedes_matching_result_id FROM matching_results")).one() == (None, None)
        assert connection.execute(text("SELECT generation FROM matching_heads")).scalar_one() == 0
        session.commit()
