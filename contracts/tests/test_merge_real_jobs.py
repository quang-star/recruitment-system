"""External listing aggregation is offline and retains all source observations."""
import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('merge_real_jobs', ROOT / 'scripts/merge-real-jobs.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


def test_merge_deduplicates_tracking_urls_without_losing_source_context(tmp_path):
    first = {'source': 'JobOKO', 'listingUrl': 'https://example.org/list', 'retrievedOn': '2026-11-18',
             'records': [{'sourceUrl': 'https://EXAMPLE.org/job/?utm_source=mail&id=4#section',
                          'title': 'Accountant', 'salaryText': None, 'status': 'unknown'}]}
    second = {'source': 'JobOKO', 'observation': 'older cache',
              'jobs': [{'sourceUrl': 'https://example.org/job?id=4&fbclid=123', 'title': 'Accountant',
                        'employer': 'Example employer', 'currentStatus': 'unknown'}]}
    a, b = tmp_path / 'a.json', tmp_path / 'b.json'
    a.write_text(json.dumps(first), encoding='utf-8')
    b.write_text(json.dumps(second), encoding='utf-8')
    result = merge.merge_files([b, a])
    assert result['inputRecords'] == 2 and result['uniqueSourceUrls'] == 1
    entry = result['jobs'][0]
    assert entry['normalizedSourceUrl'] == 'https://example.org/job?id=4'
    assert entry['observations'] == [
        {'sourceFile': 'a.json', 'sourceContext': {k: v for k, v in first.items() if k != 'records'}, 'record': first['records'][0]},
        {'sourceFile': 'b.json', 'sourceContext': {k: v for k, v in second.items() if k != 'jobs'}, 'record': second['jobs'][0]},
    ]


@pytest.mark.parametrize('url', ['http://example.org/job', 'https://user@example.org/job', 'https://example.org:8443/job', 'not-a-url'])
def test_rejects_unsafe_or_invalid_source_urls(url):
    with pytest.raises(ValueError):
        merge.normalized_url(url)


def test_cli_excludes_output_from_input_glob_and_never_overwrites(tmp_path, capsys):
    source = tmp_path / 'real-jobs-original.json'
    source.write_text(json.dumps({'source': 'Example', 'jobs': [
        {'title': 'Example role', 'sourceUrl': 'https://example.org/job', 'status': 'unknown'}]}), encoding='utf-8')
    output = tmp_path / 'real-jobs-merged.json'
    assert merge.main(['--input-dir', str(tmp_path), '--output', str(output)]) == 0
    original = output.read_text(encoding='utf-8')
    assert json.loads(original)['inputRecords'] == 1
    assert merge.main(['--input-dir', str(tmp_path), '--output', str(output)]) == 1
    assert output.read_text(encoding='utf-8') == original
    assert 'Merge stopped' in capsys.readouterr().err
