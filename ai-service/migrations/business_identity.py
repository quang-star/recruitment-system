"""Frozen helpers for the offline 0019/0020 business identity upgrade.

Mappings contain identifiers only. Each database exports its own mappings;
conversion never connects to or joins another service database.
"""
from hashlib import md5, sha256
import json
from pathlib import Path
import re
from uuid import UUID, uuid5

import sqlalchemy as sa

DUAL = {"processing_tasks": "task", "parsed_cv_revisions": "cv_revision",
        "parsed_jd_revisions": "jd_revision", "matching_results": "matching_result"}
SINGLE = {"skill_catalog_history": "skill_history", "skill_source_occurrences": "occurrence",
          "reprocessing_batches": "reprocessing_batch", "reprocessing_items": "reprocessing_item",
          "reprocessing_attempts": "reprocessing_attempt", "reprocessing_audit": "reprocessing_audit"}
TECHNICAL = {"public_id", "event_id", "correlation_id", "causation_id", "lease_token"}
JSON_TECHNICAL = {"eventId", "correlationId", "causationId", "evidenceId", "evidenceIds", "leaseToken"}
UUID_PATTERN = re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")


def execute(connection, sql, values=None):
    return connection.execute(sa.text(sql), values or {})


def quote(value):
    return '"' + value.replace('"', '""') + '"'


def archive(connection, kind, legacy, identity):
    execute(connection, """INSERT INTO legacy_identity_map(service,entity_type,legacy_id,entity_id)
        VALUES ('ai',:kind,CAST(:legacy AS uuid),:identity)
        ON CONFLICT(service,entity_type,legacy_id) DO UPDATE SET entity_id=EXCLUDED.entity_id""",
        {"kind": kind, "legacy": str(legacy), "identity": identity})


def prepare(connection):
    execute(connection, """CREATE TABLE IF NOT EXISTS legacy_identity_map (
        service VARCHAR(20) NOT NULL, entity_type VARCHAR(80) NOT NULL,
        legacy_id UUID NOT NULL, entity_id BIGINT NOT NULL CHECK(entity_id>0),
        PRIMARY KEY(service,entity_type,legacy_id))""")
    for table, kind in DUAL.items():
        execute(connection, f"""INSERT INTO legacy_identity_map
            SELECT 'ai','{kind}',public_id,id FROM {quote(table)}
            ON CONFLICT(service,entity_type,legacy_id) DO UPDATE SET entity_id=EXCLUDED.entity_id""")
    for table, kind in SINGLE.items():
        execute(connection, f"""INSERT INTO legacy_identity_map
            SELECT 'ai','{kind}',id,row_number() OVER(ORDER BY id) FROM {quote(table)}
            ON CONFLICT(service,entity_type,legacy_id) DO UPDATE SET entity_id=EXCLUDED.entity_id""")
    root = Path(__file__).resolve().parents[2] / "contracts/taxonomy/it-skills-v1.seed.json"
    if not root.exists():
        root = Path('/app/contracts/taxonomy/it-skills-v1.seed.json')
    seed = json.loads(root.read_text(encoding='utf-8'))
    skills = {skill['stableId']: index for index, skill in enumerate(seed['skills'], 1)}
    discovered = set(str(value) for value in execute(connection, 'SELECT stable_id FROM taxonomy_skills').scalars())

    def discover(value, field=''):
        if isinstance(value, dict):
            for key, item in value.items():
                discover(item, key)
        elif isinstance(value, list):
            for item in value:
                discover(item, field)
        elif field in {'stableId', 'skillId', 'canonicalSkillId', 'targetSkillIds'} and isinstance(value, str) and UUID_PATTERN.fullmatch(value):
            discovered.add(value)

    for table, column in json_columns(connection):
        for value in execute(connection, f'SELECT {quote(column)} FROM {quote(table)}').scalars():
            discover(value)
    for legacy in sorted(discovered - skills.keys()):
        skills[legacy] = len(skills) + 1
    for legacy, identity in skills.items():
        archive(connection, 'skill', legacy, identity)
    # These old review endpoints emitted synthetic task UUIDs. Keep aliases to
    # the actual task identity so Core projections can be converted faithfully.
    for identity, kind, resource in execute(connection, 'SELECT id,task_type,resource_id FROM processing_tasks WHERE resource_id IS NOT NULL'):
        namespace = UUID('f5c2b49a-9f40-4d7b-9b47-2aa83ea1a2e7') if kind == 'PARSE_CV' else UUID('b73b8a62-d9ba-4d26-9a7e-96f1c84c3e75')
        archive(connection, 'task', uuid5(namespace, str(resource)), identity)
    for identity, version, revision in execute(connection, """SELECT t.id,r.job_version_id,r.public_id
        FROM parsed_jd_revisions r JOIN processing_tasks t ON t.resource_id=r.job_version_id AND t.task_type='PARSE_JD'"""):
        archive(connection, 'task', UUID(bytes=md5(f'{version}:{revision}'.encode()).digest(), version=3), identity)
    for index, resource in enumerate(execute(connection, 'SELECT DISTINCT resource_id FROM extraction_usage ORDER BY resource_id').scalars(), 1):
        archive(connection, 'usage_resource', resource, index)


def json_columns(connection):
    return list(execute(connection, """SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND data_type IN ('json','jsonb')
        ORDER BY table_name,ordinal_position"""))


def convert(connection):
    if execute(connection, "SELECT count(*) FROM reprocessing_items WHERE state='PROCESSING'").scalar_one():
        raise ValueError('Finish or recover all reprocessing leases before the offline identity upgrade')
    mappings = {}
    global_ids = {}
    for owner, kind, legacy, identity in execute(connection, 'SELECT service,entity_type,legacy_id,entity_id FROM legacy_identity_map'):
        mappings[owner, kind, str(legacy)] = identity
        if kind != 'usage_resource':
            global_ids.setdefault(str(legacy), set()).add(identity)

    def lookup(owner, kind, value):
        if value is None:
            return None
        try:
            return mappings[owner, kind, str(value)]
        except KeyError:
            raise ValueError(f'Identity upgrade requires imported {owner}/{kind} mappings') from None

    def rewrite(value, field='', evidence=False):
        if isinstance(value, dict):
            result = {('id' if key == 'publicId' else key): rewrite(item, key, evidence or key == 'evidence') for key, item in value.items()}
            if result.get('schemaVersion') in {'parsed-cv/1.0', 'parsed-jd/1.0', 'skill-taxonomy/1.0'}:
                result['schemaVersion'] = result['schemaVersion'].replace('/1.0', '/2.0')
            if isinstance(result.get('$schema'), str):
                result['$schema'] = result['$schema'].replace('-v1.', '-v2.')
            if isinstance(result.get('eventType'), str) and result['eventType'].endswith('.v1'):
                result['eventType'] = result['eventType'][:-1] + '2'
                result['schemaVersion'] = 2
            if isinstance(result.get('idempotencyKey'), str):
                result['idempotencyKey'] = rewrite_key(result['idempotencyKey'])
            return result
        if isinstance(value, list):
            return [rewrite(item, field, evidence) for item in value]
        is_id = field in {'id', 'publicId'} or field.endswith(('Id', 'Ids', '_id', '_ids'))
        if is_id and field not in JSON_TECHNICAL and not evidence and isinstance(value, str) and UUID_PATTERN.fullmatch(value):
            options = global_ids.get(value, set())
            if len(options) != 1:
                raise ValueError('Identity upgrade requires complete, unambiguous JSON mappings')
            return str(next(iter(options)))
        return value

    def rewrite_key(value):
        def substitute(match):
            options = global_ids.get(match.group(0), set())
            if len(options) != 1:
                raise ValueError('Identity upgrade requires complete event-key mappings')
            return str(next(iter(options)))
        return re.sub(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', substitute, value).replace('.v1:', '.v2:')

    # Read and compute every value before DDL: joins below still use legacy IDs.
    columns = list(execute(connection, """SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND udt_name='uuid' AND table_name<>'legacy_identity_map'
        ORDER BY table_name,ordinal_position"""))
    converted = []
    for table, column in columns:
        if column in TECHNICAL:
            continue
        rows = list(execute(connection, f'SELECT ctid::text AS row_key,* FROM {quote(table)}').mappings())
        values = []
        for row in rows:
            value = row[column]
            if value is None:
                values.append((row['row_key'], None))
                continue
            owner, kind = namespace(connection, table, column, row, mappings)
            values.append((row['row_key'], lookup(owner, kind, value)))
        converted.append((table, column, values))
    # Add temporary numeric columns, fill using stable row locators, then swap
    # together. Updating ctid one column at a time would invalidate later rows.
    for table in sorted({target[0] for target in converted}):
        targets = [target for target in converted if target[0] == table]
        for _, column, _ in targets:
            execute(connection, f'ALTER TABLE {quote(table)} ADD COLUMN {quote(column + "_numeric")} BIGINT')
        by_row = {}
        for _, column, values in targets:
            for locator, value in values:
                by_row.setdefault(locator, {})[column] = value
        for locator, values in by_row.items():
            assignments = ','.join(f'{quote(key + "_numeric")}=:{key}' for key in values)
            execute(connection, f'UPDATE {quote(table)} SET {assignments} WHERE ctid=CAST(:locator AS tid)', {**values, 'locator': locator})
    constraints = list(execute(connection, """SELECT t.relname,c.conname,pg_get_constraintdef(c.oid)
        FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=current_schema() AND c.contype IN ('f','c') ORDER BY c.contype DESC"""))
    for table, name, _ in constraints:
        execute(connection, f'ALTER TABLE {quote(table)} DROP CONSTRAINT {quote(name)}')
    # CV version 1 and JD version 1 may now coexist; drop the legacy global
    # resource uniqueness before rebuilding the converted column's indexes.
    for constraint in sa.inspect(connection).get_unique_constraints('processing_tasks'):
        if constraint['column_names'] == ['resource_id']:
            execute(connection, f'ALTER TABLE processing_tasks DROP CONSTRAINT {quote(constraint["name"])}')
    for table, column, _ in converted:
        execute(connection, f'ALTER TABLE {quote(table)} ALTER COLUMN {quote(column)} TYPE BIGINT USING {quote(column + "_numeric")}')
        execute(connection, f'ALTER TABLE {quote(table)} DROP COLUMN {quote(column + "_numeric")}')
    for table, name, definition in constraints:
        execute(connection, f'ALTER TABLE {quote(table)} ADD CONSTRAINT {quote(name)} {definition}')
    for table in DUAL:
        execute(connection, f'ALTER TABLE {quote(table)} DROP COLUMN public_id')
    for table in SINGLE:
        execute(connection, f'ALTER TABLE {quote(table)} ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY')
    for table in (*DUAL, *SINGLE):
        execute(connection, f"SELECT setval(pg_get_serial_sequence('{table}','id'),COALESCE(MAX(id),1),MAX(id) IS NOT NULL) FROM {quote(table)}")
    # resource IDs are unique only within their resource type.
    execute(connection, 'ALTER TABLE processing_tasks ADD CONSTRAINT uk_processing_task_resource UNIQUE(task_type,resource_id)')
    # JSON and key rewrites retain technical UUIDs and document text unchanged.
    for table, column in json_columns(connection):
        for locator, value in execute(connection, f'SELECT ctid::text,{quote(column)} FROM {quote(table)}').all():
            if value is not None:
                execute(connection, f'UPDATE {quote(table)} SET {quote(column)}=CAST(:value AS json) WHERE ctid=CAST(:locator AS tid)', {'value': json.dumps(rewrite(value)), 'locator': locator})
    execute(connection, "UPDATE taxonomy_versions SET schema_version='skill-taxonomy/2.0'")
    for version, payload in execute(connection, 'SELECT semantic_version,payload FROM taxonomy_versions WHERE payload IS NOT NULL').all():
        execute(connection, 'UPDATE taxonomy_versions SET source_hash=:hash WHERE semantic_version=:version', {'version': version, 'hash': sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()})
    for identity, topic, key in execute(connection, 'SELECT event_id,topic,message_key FROM ai_outbox_events').all():
        execute(connection, 'UPDATE ai_outbox_events SET topic=:topic,message_key=:key WHERE event_id=:id', {'topic': re.sub(r'\.v1$', '.v2', topic), 'key': rewrite_key(key), 'id': identity})
    execute(connection, "UPDATE reprocessing_batches SET state='PAUSED',version=version+1 WHERE state='RUNNING'")
    for scope in execute(connection, "SELECT DISTINCT scope FROM extraction_daily_budgets WHERE scope<>'global'").scalars().all():
        if UUID_PATTERN.fullmatch(scope):
            execute(connection, 'UPDATE extraction_daily_budgets SET scope=:value WHERE scope=:scope', {'value': str(lookup('auth', 'user', scope)), 'scope': scope})
    # Rebuild occurrence idempotency hashes from the new identity tuple.
    for identity, kind, source, term, role in execute(connection, 'SELECT id,source_kind,source_version_id,normalized_term,field_role FROM skill_source_occurrences').all():
        value = sha256(f'{kind}:{source}:{role}:{term}'.encode()).hexdigest()
        execute(connection, 'UPDATE skill_source_occurrences SET identity_hash=:value WHERE id=:id', {'value': value, 'id': identity})


def namespace(connection, table, column, row, mappings):
    if column in {'owner_user_id', 'actor_id', 'confirmed_by'}:
        return 'auth', 'user'
    if column == 'id':
        return 'ai', SINGLE[table]
    if column in {'skill_id', 'stable_id', 'observed_canonical_skill_id'}:
        return 'ai', 'skill'
    if column in {'cv_version_id', 'job_version_id', 'job_id', 'application_id'}:
        return 'core', column.removesuffix('_id')
    if column in {'result_id', 'matching_result_id', 'supersedes_matching_result_id'}:
        return 'ai', 'matching_result'
    if column in {'batch_id', 'item_id', 'occurrence_id'}:
        return 'ai', {'batch_id': 'reprocessing_batch', 'item_id': 'reprocessing_item', 'occurrence_id': 'occurrence'}[column]
    if table == 'skill_occurrence_revisions' and column == 'revision_id':
        source_kind = execute(connection, 'SELECT source_kind FROM skill_source_occurrences WHERE id=:id', {'id': row['occurrence_id']}).scalar_one()
        return 'ai', 'cv_revision' if source_kind == 'CV' else 'jd_revision'
    if column in {'revision_id', 'supersedes_revision_id'}:
        return 'ai', 'cv_revision' if table.startswith('parsed_cv') else 'jd_revision'
    if column in {'cv_revision_id', 'jd_revision_id'}:
        return 'ai', column.removesuffix('_id')
    if column in {'first_revision_id', 'latest_revision_id'}:
        return 'ai', 'cv_revision' if row['source_kind'] == 'CV' else 'jd_revision'
    if column == 'source_version_id':
        return 'core', 'cv_version' if row['source_kind'] == 'CV' else 'job_version'
    if column == 'resource_id':
        if table == 'privacy_tombstones':
            return 'core', {'CV': 'cv_version', 'JD': 'job_version', 'APPLICATION': 'application'}[row['kind']]
        if table == 'processing_tasks':
            return 'core', 'cv_version' if row['task_type'] == 'PARSE_CV' else 'job_version'
        if table == 'extraction_usage':
            kind = 'cv_version' if row['document_kind'] == 'cv' else 'job_version'
            if ('core', kind, str(row[column])) in mappings or row['document_kind'] == 'cv':
                return 'core', kind
            # Career suggestions had an AI-local draft resource. A persisted
            # JD/task must still have its Core mapping; never invent its owner.
            persisted = execute(connection, "SELECT EXISTS(SELECT 1 FROM parsed_jd_revisions WHERE job_version_id=:id) OR EXISTS(SELECT 1 FROM processing_tasks WHERE task_type='PARSE_JD' AND resource_id=:id)", {'id': row[column]}).scalar_one()
            return ('core', kind) if persisted else ('ai', 'usage_resource')
    if table == 'reprocessing_items' and column in {'resource_id', 'output_id'}:
        operation = execute(connection, 'SELECT operation FROM reprocessing_batches WHERE id=:id', {'id': row['batch_id']}).scalar_one()
        if column == 'resource_id':
            return 'core', {'PARSE_CV': 'cv_version', 'PARSE_JD': 'job_version', 'MATCH_APPLICATION': 'application'}[operation]
        return 'ai', {'PARSE_CV': 'cv_revision', 'PARSE_JD': 'jd_revision', 'MATCH_APPLICATION': 'matching_result'}[operation]
    raise ValueError(f'Unsupported identity reference: {table}.{column}')
