"""Offline checks for the local observed-listing demo seeder."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('seed_real_observed', ROOT / 'scripts/seed-real-observed.py')
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


def fixture(tmp_path):
    record = {'title': 'Accountant', 'employer': 'Example', 'sourceUrl': 'https://example.org/job'}
    data = {'schemaVersion': 'external-job-observations/1.0', 'jobs': [{
        'normalizedSourceUrl': record['sourceUrl'],
        'observations': [{'sourceContext': {'source': 'Example'}, 'record': record}]}]}
    path = tmp_path / 'input.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    return path


def test_observed_seed_never_fabricates_missing_job_details(tmp_path):
    records, skipped = seed.load_observations(fixture(tmp_path))
    assert len(records) == 1 and not skipped
    item = records[0]
    job = seed.job_spec(item, '42')
    assert job['category']['industryId'] == '42'
    assert job['externalAiConsent'] is False
    assert job['applicationDeadline'] is None
    assert job['employmentType'] is None and job['salaryMin'] is None
    assert 'chưa xác minh' in job['description']
    assert 'chưa được thu thập' in job['requirementsText']
    assert seed._hash(item['url']) in job['description']


def test_dry_run_is_offline(monkeypatch, capsys, tmp_path):
    def forbidden(*args, **kwargs):
        raise AssertionError('dry-run must not connect')
    monkeypatch.setattr(seed.demo, 'HttpClient', forbidden)
    assert seed.main(['--data', str(fixture(tmp_path)), '--dry-run']) == 0
    assert '1 jobs' in capsys.readouterr().out
