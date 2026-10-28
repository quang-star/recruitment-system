"""Offline identifier-only handoff between separately owned service databases.

The URL is taken from one explicitly named environment variable. Never reads
environment files, prints URLs, or opens more than one database per invocation.
"""
import argparse
import json
import os
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine, text

MAX_ID = 9223372036854775807
SERVICES = {'auth', 'core', 'ai'}


def read_mapping(path):
    value = json.loads(path.read_text(encoding='utf-8'))
    if value.get('format') != 'business-identity-map/1' or value.get('service') not in SERVICES:
        raise ValueError('Unsupported identifier mapping file')
    rows = []
    seen = {}
    for row in value['mappings']:
        kind, legacy, identity = row['entityType'], str(UUID(row['legacyId'])), row['id']
        if not isinstance(kind, str) or not kind or len(kind) > 80:
            raise ValueError('Invalid entity type')
        if not isinstance(identity, str) or not identity.isascii() or not identity.isdecimal() or identity.startswith('0') or not 0 < int(identity) <= MAX_ID:
            raise ValueError('Invalid numeric identity')
        key = kind, legacy
        if key in seen and seen[key] != identity:
            raise ValueError('Conflicting identifier mapping')
        seen[key] = identity
        rows.append({'service': value['service'], 'kind': kind, 'legacy': legacy, 'identity': int(identity)})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url-env', required=True, help='Name of an explicitly supplied PostgreSQL URL variable')
    parser.add_argument('--service', choices=sorted(SERVICES), required=True, help='Owner of the connected database')
    actions = parser.add_subparsers(dest='action', required=True)
    export = actions.add_parser('export')
    export.add_argument('file', type=Path)
    ingest = actions.add_parser('import')
    ingest.add_argument('files', type=Path, nargs='+')
    args = parser.parse_args()
    # Validate all input before opening a connection; an import is one transaction.
    rows = [row for file in args.files for row in read_mapping(file)] if args.action == 'import' else []
    if any(row['service'] == args.service for row in rows):
        raise ValueError('Import only foreign service mappings; the owner migration creates local mappings')
    engine = create_engine(os.environ[args.url_env], hide_parameters=True)
    if engine.dialect.name != 'postgresql':
        raise ValueError('The identity handoff requires PostgreSQL')
    try:
        with engine.begin() as connection:
            if args.action == 'export':
                connection.execute(text('SET TRANSACTION READ ONLY'))
                values = connection.execute(text('SELECT entity_type,legacy_id,entity_id FROM legacy_identity_map WHERE service=:owner ORDER BY entity_type,legacy_id'), {'owner': args.service})
                payload = {'format': 'business-identity-map/1', 'service': args.service,
                           'mappings': [{'entityType': kind, 'legacyId': str(legacy), 'id': str(identity)} for kind, legacy, identity in values]}
                with args.file.open('x', encoding='utf-8') as stream:
                    json.dump(payload, stream, indent=2)
                    stream.write('\n')
                print(f'Exported {len(payload["mappings"])} identifier mappings')
            else:
                for row in rows:
                    old = connection.execute(text('SELECT entity_id FROM legacy_identity_map WHERE service=:service AND entity_type=:kind AND legacy_id=CAST(:legacy AS uuid)'), row).scalar_one_or_none()
                    if old is not None and old != row['identity']:
                        raise ValueError('Imported mapping conflicts with a staged identity')
                    connection.execute(text('INSERT INTO legacy_identity_map(service,entity_type,legacy_id,entity_id) VALUES (:service,:kind,CAST(:legacy AS uuid),:identity) ON CONFLICT(service,entity_type,legacy_id) DO NOTHING'), row)
                print(f'Imported {len(rows)} identifier mappings')
    finally:
        engine.dispose()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Driver exception strings may include credentials, SQL parameters or URLs.
        raise SystemExit(f'Identity handoff failed ({type(error).__name__}); no connection details are printed') from None
