"""Opt-in data-preservation gate; requires an explicitly isolated PostgreSQL URL."""
import importlib.util
import json
from datetime import UTC, datetime
from hashlib import sha256
import os
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import create_engine, inspect, text

from migrations.business_identity import convert, prepare

pytestmark = pytest.mark.skipif(not os.getenv('IDENTITY_TEST_DB_URL'), reason='requires explicitly isolated identity PostgreSQL')


def run_migrations(connection, through):
    for path in sorted((Path(__file__).parents[1] / 'migrations/versions').glob('*.py')):
        if int(path.name.split('_')[0]) > through:
            continue
        spec = importlib.util.spec_from_file_location('identity_test_' + path.stem, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()


@pytest.fixture
def legacy_connection():
    engine = create_engine(os.environ['IDENTITY_TEST_DB_URL'], hide_parameters=True)
    assert engine.dialect.name == 'postgresql'
    with engine.connect() as connection:
        transaction = connection.begin()
        schema = 'identity_upgrade_' + uuid4().hex
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        run_migrations(connection, 18)
        yield connection
        # The complete fixture, schema and DDL are rolled back together.
        transaction.rollback()
    engine.dispose()


def test_empty_install_converts_legacy_seed_and_all_business_columns(legacy_connection):
    connection = legacy_connection
    prepare(connection)
    convert(connection)
    uuid_columns = connection.execute(text("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND udt_name='uuid'")).all()
    assert all(column in {'event_id', 'correlation_id', 'lease_token', 'legacy_id'} for _, column in uuid_columns)
    skills = connection.execute(text('SELECT skills FROM skill_catalog')).scalar_one()
    assert skills[0]['stableId'] == '1'
    assert 'public_id' not in {field['name'] for field in inspect(connection).get_columns('processing_tasks')}


def test_upgrade_preserves_ids_revisions_payloads_events_and_fails_closed(legacy_connection):
    connection = legacy_connection
    owner, cv, jd, job, revision, event, evidence = (uuid4() for _ in range(7))
    payload = {'schemaVersion': 'parsed-cv/1.0', 'document': {'cvVersionId': str(cv)},
               'skills': [], 'evidence': [{'id': str(evidence), 'start': 1, 'end': 2}],
               'untouchedText': 'Synthetic immutable content'}
    for identity, kind, resource in [(7, 'PARSE_CV', cv), (8, 'PARSE_JD', jd)]:
        connection.execute(text("INSERT INTO processing_tasks(id,public_id,task_type,state,resource_id,owner_user_id,source_hash) VALUES(:id,:public,:kind,'PROCESSING',:resource,:owner,:hash)"),
                           dict(id=identity, public=uuid4(), kind=kind, resource=resource, owner=owner, hash='a' * 64))
    connection.execute(text("INSERT INTO parsed_cv_revisions(id,public_id,cv_version_id,owner_user_id,revision_number,source_hash,payload) VALUES(11,:revision,:cv,:owner,1,:hash,CAST(:payload AS json))"),
                       dict(revision=revision, cv=cv, owner=owner, hash='a' * 64, payload=json.dumps(payload)))
    connection.execute(text('INSERT INTO parsed_cv_heads(cv_version_id,revision_id,confirmed_by) VALUES(:cv,11,:owner)'), dict(cv=cv, owner=owner))
    old_key = sha256(f'cv:{cv}:{"a" * 64}:gemini:synthetic'.encode()).hexdigest()
    connection.execute(text("INSERT INTO extraction_usage(request_key,owner_user_id,resource_id,document_kind,provider,model,policy_version,outcome,created_at,updated_at) VALUES(:key,:owner,:cv,'cv','gemini','synthetic','external-ai/1.0','SUCCEEDED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"), dict(key=old_key, owner=owner, cv=cv))
    connection.execute(text('INSERT INTO extraction_daily_budgets(day,scope,call_count) VALUES(CURRENT_DATE,:owner,1)'), dict(owner=str(owner)))
    envelope = {'eventId': str(event), 'eventType': 'cv.processing.updated.v1', 'schemaVersion': 1,
                'correlationId': str(uuid4()), 'idempotencyKey': f'cv.processing.updated.v1:{cv}:PARSED',
                'payload': {'cvVersionId': str(cv), 'parsedRevisionId': str(revision)}}
    connection.execute(text("INSERT INTO ai_outbox_events(event_id,topic,message_key,envelope,available_at,created_at) VALUES(:id,'cv.processing.updated.v1',:key,CAST(:payload AS json),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"),
                       dict(id=event, key=str(cv), payload=json.dumps(envelope)))
    prepare(connection)
    with pytest.raises(ValueError, match='requires imported'):
        with connection.begin_nested():
            convert(connection)
    assert connection.execute(text('SELECT owner_user_id FROM parsed_cv_revisions')).scalar_one() == owner
    for service, kind, legacy, identity in [('auth', 'user', owner, 9007199254740993), ('core', 'cv_version', cv, 1), ('core', 'job_version', jd, 1), ('core', 'job', job, 1)]:
        connection.execute(text('INSERT INTO legacy_identity_map VALUES(:service,:kind,:legacy,:id)'), dict(service=service, kind=kind, legacy=legacy, id=identity))
    convert(connection)
    tasks = connection.execute(text('SELECT id,resource_id,task_type FROM processing_tasks ORDER BY id')).all()
    assert tasks == [(7, 1, 'PARSE_CV'), (8, 1, 'PARSE_JD')]
    stored = connection.execute(text('SELECT id,owner_user_id,payload FROM parsed_cv_revisions')).one()
    assert stored.id == 11 and stored.owner_user_id == 9007199254740993
    assert stored.payload['document']['cvVersionId'] == '1' and stored.payload['schemaVersion'] == 'parsed-cv/2.0'
    assert stored.payload['evidence'] == payload['evidence'] and stored.payload['untouchedText'] == payload['untouchedText']
    assert connection.execute(text('SELECT revision_id FROM parsed_cv_heads')).scalar_one() == 11
    pending = connection.execute(text('SELECT event_id,topic,message_key,envelope FROM ai_outbox_events')).one()
    assert pending.event_id == event and pending.message_key == '1' and pending.topic.endswith('.v2')
    assert pending.envelope['payload']['parsedRevisionId'] == '11' and pending.envelope['schemaVersion'] == 2
    assert pending.envelope['correlationId'] == envelope['correlationId']
    assert pending.envelope['idempotencyKey'] == 'cv.processing.updated.v2:1:PARSED'
    from sqlalchemy.orm import sessionmaker
    from app.shared.extraction_usage import ExtractionUsageRepository
    from app.shared.extraction_types import ExtractionContext
    factory = sessionmaker(bind=connection, join_transaction_mode='create_savepoint')
    budget = ExtractionUsageRepository(factory, daily_limit=10, user_daily_limit=10)
    result = budget.reserve(ExtractionContext(9007199254740993, 1, 'a' * 64, True, 'external-ai/1.0'), 'cv', 'gemini', 'synthetic', now=datetime.now(UTC))
    assert result == (None, 'EXTERNAL_AI_ALREADY_REQUESTED')
    assert connection.execute(text("SELECT call_count FROM extraction_daily_budgets WHERE scope='9007199254740993'")).scalar_one() == 1
    # Generated identities continue beyond the preserved rows.
    created = connection.execute(text("INSERT INTO processing_tasks(task_type,state) VALUES('REPROCESS','QUEUED') RETURNING id")).scalar_one()
    assert created > 8
