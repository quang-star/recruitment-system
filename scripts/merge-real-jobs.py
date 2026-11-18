#!/usr/bin/env python3
"""Merge observed external job metadata for review; never contacts a service or database."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TRACKING_PARAMETERS = {'gclid', 'fbclid', 'ta_source', 'u_sr_id', 'apply'}


def normalized_url(value: object) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ValueError('Each record needs a nonempty sourceUrl')
    url = urlsplit(value)
    if url.scheme.lower() != 'https' or not url.hostname or url.username or url.password:
        raise ValueError('sourceUrl must be an HTTPS URL without credentials')
    try:
        port = url.port
    except ValueError as error:
        raise ValueError('Invalid sourceUrl port') from error
    if port not in (None, 443):
        raise ValueError('sourceUrl must use the default HTTPS port')
    parameters = [(name, item) for name, item in parse_qsl(url.query, keep_blank_values=True)
                  if not (name.lower().startswith('utm_') or name.lower() in TRACKING_PARAMETERS)]
    # The order of repeated parameters can matter. Sort only unambiguous keys.
    if len({name for name, _ in parameters}) == len(parameters):
        parameters.sort()
    path = url.path.rstrip('/') or '/'
    return urlunsplit(('https', url.hostname.lower(), path, urlencode(parameters, doseq=True), ''))


def merge_files(paths: list[Path]) -> dict:
    groups: dict[str, dict] = {}
    count = 0
    for path in sorted(paths, key=lambda item: str(item)):
        payload = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(payload, dict) or ('jobs' in payload) == ('records' in payload):
            raise ValueError(f'{path.name}: expected exactly one jobs or records array')
        field = 'jobs' if 'jobs' in payload else 'records'
        records = payload[field]
        if not isinstance(records, list):
            raise ValueError(f'{path.name}: {field} must be an array')
        context = {key: value for key, value in payload.items() if key != field}
        for index, record in enumerate(records):
            if not isinstance(record, dict) or not isinstance(record.get('title'), str) or not record['title'].strip():
                raise ValueError(f'{path.name}: record {index + 1} needs a title')
            key = normalized_url(record.get('sourceUrl'))
            observation = {'sourceFile': path.name, 'sourceContext': context, 'record': record}
            groups.setdefault(key, {'normalizedSourceUrl': key, 'observations': []})['observations'].append(observation)
            count += 1
    return {'schemaVersion': 'external-job-observations/1.0', 'inputRecords': count,
            'uniqueSourceUrls': len(groups), 'jobs': list(groups.values())}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=Path('outputs'))
    parser.add_argument('--output', type=Path, default=Path('outputs/merged-external-jobs.json'))
    args = parser.parse_args(argv)
    try:
        output = args.output.resolve()
        files = [p for p in args.input_dir.glob('real-jobs-*.json') if p.is_file() and p.resolve() != output]
        if not files:
            raise ValueError('No input files found')
        result = merge_files(files)
        with args.output.open('x', encoding='utf-8', newline='\n') as file:
            json.dump(result, file, ensure_ascii=False, indent=2)
            file.write('\n')
        print(f"Merged {result['inputRecords']} observations into {result['uniqueSourceUrls']} unique source URLs: {args.output}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f'Merge stopped: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
