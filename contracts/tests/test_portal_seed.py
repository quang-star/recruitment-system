"""Offline seed workflow regression; no application database or provider calls."""
from copy import deepcopy
from datetime import UTC, datetime
import importlib.util
import json
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('portal_seed', ROOT / 'scripts/seed-portal.py')
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)
FIXTURE = ROOT / 'scripts/seed-portal-data.json'


class FakeApi:
    def __init__(self):
        self.companies = []
        self.jobs = {}
        self.revisions = {}
        self.calls = []
        self.counter = 9007199254740993
        self.fail_publish = False

    def identity(self):
        self.counter += 1
        return str(self.counter)

    def json(self, method, path, *, token, payload=None):
        assert token == 'synthetic-only'
        assert path.startswith('/api/v2/')
        self.calls.append((method, path, deepcopy(payload)))
        if path == '/api/v2/companies':
            if method == 'GET':
                return deepcopy(self.companies)
            assert method == 'POST'
            item = {**payload, 'companyId': self.identity()}
            self.companies.append(item)
            return deepcopy(item)
        match = re.fullmatch(r'/api/v2/companies/(\d+)/jobs', path)
        if match:
            items = self.jobs.setdefault(match[1], [])
            if method == 'GET':
                return deepcopy(items)
            assert method == 'POST'
            item = {**payload, 'jobId': self.identity(), 'jobVersionId': self.identity(), 'status': 'DRAFT', 'version': 0}
            items.append(item)
            self.revisions[item['jobVersionId']] = {'revisionId': self.identity(), 'status': 'PARSED'}
            return deepcopy(item)
        match = re.fullmatch(r'/api/v2/parsed-jds/(\d+)(/confirm)?', path)
        if match:
            revision = self.revisions[match[1]]
            if match[2]:
                assert method == 'POST' and payload == {'expectedRevisionId': revision['revisionId']}
                revision['status'] = 'CONFIRMED'
            return deepcopy(revision)
        match = re.fullmatch(r'/api/v2/jobs/(\d+)(/publish\?version=\d+)?', path)
        if match:
            job = next(item for items in self.jobs.values() for item in items if item['jobId'] == match[1])
            if match[2]:
                if self.fail_publish:
                    raise portal.demo.ApiFailure(403, {'message': 'Synthetic failure'}, method, path)
                assert self.revisions[job['jobVersionId']]['status'] == 'CONFIRMED'
                job['status'] = 'PUBLISHED'
                job['version'] += 1
            return deepcopy(job)
        raise AssertionError(f'Unexpected API call: {method} {path}')


def test_fixture_preserves_portal_content_without_business_uuid_or_status_overrides():
    companies = portal.load_fixture(FIXTURE)
    assert len(companies) == 8 and sum(len(group['jobs']) for group in companies) == 11
    assert not re.search(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', FIXTURE.read_text(encoding='utf-8'))
    assert all(group['company']['slug'].startswith('demo-portal-') for group in companies)
    assert all(job['externalAiConsent'] is False for group in companies for job in group['jobs'])
    assert 'Kỹ sư Lập trình Fullstack (Java / Spring Boot & React)' in {job['title'] for group in companies for job in group['jobs']}


def test_seed_uses_server_ids_confirms_before_publish_and_is_repeatable():
    api = FakeApi()
    companies = portal.load_fixture(FIXTURE)
    first = portal.seed_portal(api, 'synthetic-only', companies)
    second = portal.seed_portal(api, 'synthetic-only', companies)
    assert first == second and first['companyCount'] == 8 and first['jobCount'] == 11
    assert len(api.companies) == 8 and sum(len(items) for items in api.jobs.values()) == 11
    assert all(job['status'] == 'PUBLISHED' and job['version'] == 1 for items in api.jobs.values() for job in items)
    assert all(int(item['companyId']) > 2**53 for item in first['companies'])
    creations = [(path, payload) for method, path, payload in api.calls if method == 'POST' and path.endswith(('/companies', '/jobs'))]
    assert len(creations) == 19
    assert all(not {'id', 'public_id', 'publicId', 'companyId', 'jobId', 'jobVersionId', 'sourceHash', 'status', 'verificationStatus'}.intersection(payload) for _, payload in creations)
    assert all(method not in {'PUT', 'PATCH', 'DELETE'} for method, _, _ in api.calls)


def test_draft_only_does_not_wait_for_ai_or_confirm_or_publish():
    api = FakeApi()
    portal.seed_portal(api, 'synthetic-only', portal.load_fixture(FIXTURE), publish=False)
    assert all(job['status'] == 'DRAFT' for items in api.jobs.values() for job in items)
    assert not any('/parsed-jds/' in path or '/publish' in path for _, path, _ in api.calls)
    deadline = datetime.fromisoformat(next(iter(api.jobs.values()))[0]['applicationDeadline'])
    assert 89 < (deadline - datetime.now(UTC)).total_seconds() / 86400 <= 90


def test_partial_seed_can_resume_without_duplicate_companies_or_jobs():
    api = FakeApi()
    api.fail_publish = True
    companies = portal.load_fixture(FIXTURE)
    with pytest.raises(portal.demo.ApiFailure):
        portal.seed_portal(api, 'synthetic-only', companies)
    assert len(api.companies) == 1 and sum(len(items) for items in api.jobs.values()) == 1
    api.fail_publish = False
    summary = portal.seed_portal(api, 'synthetic-only', companies)
    assert summary['companyCount'] == 8 and summary['jobCount'] == 11
    assert sum(len(items) for items in api.jobs.values()) == 11


@pytest.mark.parametrize('identity', [1, True, '0', '01', '9223372036854775808', '779494ac-c858-4570-a884-6e88423b8e2b'])
def test_v2_seed_rejects_legacy_or_unsafe_response_ids(identity):
    api = FakeApi()
    api.identity = lambda: identity
    with pytest.raises(ValueError, match='BIGINT'):
        portal.seed_portal(api, 'synthetic-only', portal.load_fixture(FIXTURE))
    assert not any(path.endswith('/jobs') for _, path, _ in api.calls)


@pytest.mark.parametrize('bad_field', ['public_id', 'companyId', 'createdByUserId', 'verificationStatus'])
def test_fixture_cannot_force_ownership_identity_or_verification(tmp_path, bad_field):
    payload = json.loads(FIXTURE.read_text(encoding='utf-8'))
    payload['companies'][0]['company'][bad_field] = '1'
    file = tmp_path / 'invalid.json'
    file.write_text(json.dumps(payload), encoding='utf-8')
    with pytest.raises(ValueError, match='content fields only'):
        portal.load_fixture(file)


def test_dry_run_never_opens_http_or_reads_credentials(monkeypatch, capsys):
    def forbidden(*args, **kwargs):
        raise AssertionError('Dry-run must remain offline')
    monkeypatch.setattr(portal.demo, 'HttpClient', forbidden)
    monkeypatch.setattr(portal.getpass, 'getpass', forbidden)
    assert portal.main(['--dry-run', '--password-env', 'NONEXISTENT_TEST_PASSWORD']) == 0
    assert '8 companies, 11 jobs' in capsys.readouterr().out


@pytest.mark.parametrize('url', ['https://example.com', 'http://localhost@evil.invalid', 'http://localhost/api/v2', 'http://localhost?token=synthetic'])
def test_seed_requires_an_explicit_local_origin(url):
    with pytest.raises(SystemExit) as result:
        portal.main(['--dry-run', '--gateway-url', url])
    assert result.value.code == 2
