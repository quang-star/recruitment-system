#!/usr/bin/env python3
"""Seed synthetic portal companies/JDs through local Gateway API v2."""
from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta
import getpass
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import urlsplit

_spec = importlib.util.spec_from_file_location('portal_demo_helpers', Path(__file__).with_name('seed-demo.py'))
assert _spec and _spec.loader
demo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(demo)

COMPANY_FIELDS = {'legalName', 'displayName', 'slug', 'description', 'websiteUrl', 'countryCode', 'registrationNumber', 'sizeRange'}
JOB_FIELDS = {'title', 'description', 'requirementsText', 'benefitsText', 'locationText', 'countryCode', 'workMode',
              'employmentType', 'seniorityLevel', 'openings', 'salaryMin', 'salaryMax', 'salaryCurrency',
              'salaryPeriod', 'salaryNegotiable', 'externalAiConsent', 'category'}


def numeric_id(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,18}', value) or int(value) > 9223372036854775807:
        raise ValueError('API v2 must return positive BIGINT IDs as decimal strings; migrate all services first')
    return value


def local_origin(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme not in {'http', 'https'} or parsed.hostname not in {'localhost', '127.0.0.1', '::1'}
            or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'', '/'}):
        raise argparse.ArgumentTypeError('Use a loopback Gateway/Mailpit origin for this local demo seeder')
    return value.rstrip('/')


def _strings(data: dict, limits: dict[str, int]) -> None:
    for field, maximum in limits.items():
        value = data.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > maximum:
            raise ValueError(f'Invalid fixture field: {field}')


def load_fixture(path: Path) -> list[dict]:
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict) or value.get('schemaVersion') != 'portal-seed/2.0' or value.get('synthetic') is not True:
        raise ValueError('Use a synthetic portal-seed/2.0 fixture')
    companies = value.get('companies')
    if not isinstance(companies, list) or not 1 <= len(companies) <= 100:
        raise ValueError('Fixture must contain 1–100 companies')
    slugs = set()
    for group in companies:
        if not isinstance(group, dict) or set(group) != {'company', 'jobs'}:
            raise ValueError('Invalid company fixture group')
        company, jobs = group['company'], group['jobs']
        if not isinstance(company, dict) or set(company) != COMPANY_FIELDS:
            raise ValueError('Company fixture must contain content fields only, without IDs or status overrides')
        _strings(company, {'legalName': 240, 'displayName': 240, 'slug': 160, 'description': 10000,
                           'websiteUrl': 500, 'countryCode': 2, 'registrationNumber': 80, 'sizeRange': 30})
        slug = company['slug']
        if not re.fullmatch(r'demo-portal-[a-z0-9]+(?:-[a-z0-9]+)*', slug) or slug in slugs:
            raise ValueError('Use unique demo-portal- company slugs')
        slugs.add(slug)
        if not isinstance(jobs, list) or not 1 <= len(jobs) <= 100:
            raise ValueError('Each company requires 1–100 demo jobs')
        titles = set()
        for job in jobs:
            if not isinstance(job, dict) or set(job) != JOB_FIELDS:
                raise ValueError('Job fixture must contain content fields only, without preassigned IDs')
            _strings(job, {'title': 240, 'description': 30000, 'requirementsText': 30000, 'benefitsText': 30000,
                           'locationText': 300, 'countryCode': 2, 'seniorityLevel': 30, 'salaryCurrency': 3, 'salaryPeriod': 5})
            if job['title'] in titles:
                raise ValueError('Job titles must be unique within each demo company')
            titles.add(job['title'])
            if job['externalAiConsent'] is not False or type(job['salaryNegotiable']) is not bool:
                raise ValueError('Synthetic seeding must keep external AI consent disabled')
            if job['workMode'] not in {'ONSITE', 'HYBRID', 'REMOTE'} or job['employmentType'] not in {'FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'}:
                raise ValueError('Invalid work mode or employment type')
            if job['countryCode'] != 'VN' or job['salaryCurrency'] != 'VND' or job['salaryPeriod'] != 'MONTH':
                raise ValueError('This fixture uses VN, VND and monthly salaries')
            if any(type(job[field]) is not int or job[field] < 0 for field in ('openings', 'salaryMin', 'salaryMax')) or job['openings'] < 1 or job['salaryMin'] > job['salaryMax']:
                raise ValueError('Invalid salary bounds or openings')
            category = job['category']
            if not isinstance(category, dict) or set(category) != {'industryId', 'positionName'} or category['industryId'] != '1' or category['positionName'] != job['title']:
                raise ValueError('Demo IT jobs require numeric industry ID 1 and their position name')
    return companies


def seed_portal(client: Any, token: str, companies: list[dict], *, publish: bool = True,
                deadline_days: int = 90) -> dict[str, Any]:
    if not 1 <= deadline_days <= 365:
        raise ValueError('deadline_days must be between 1 and 365')
    owned = client.json('GET', '/api/v2/companies', token=token)
    result: list[dict] = []
    deadline = (datetime.now(UTC) + timedelta(days=deadline_days)).isoformat()
    for group in companies:
        spec = group['company']
        matches = [item for item in owned if item['slug'] == spec['slug']]
        if len(matches) > 1:
            raise ValueError('Ambiguous company slug in API response')
        company = matches[0] if matches else client.json('POST', '/api/v2/companies', token=token, payload=spec)
        company_id = numeric_id(company['companyId'])
        if not matches:
            owned.append(company)
        path = f'/api/v2/companies/{company_id}/jobs'
        existing = client.json('GET', path, token=token)
        jobs = []
        for job_spec in group['jobs']:
            matching = [item for item in existing if item['title'] == job_spec['title']]
            if len(matching) > 1:
                raise ValueError('Ambiguous demo job title; no existing rows were changed')
            job = matching[0] if matching else client.json('POST', path, token=token,
                payload={**job_spec, 'applicationDeadline': deadline, 'version': None})
            numeric_id(job['jobId'])
            numeric_id(job['jobVersionId'])
            if not matching:
                existing.append(job)
            if publish:
                job = demo.ensure_job_published(client, token, job)
                numeric_id(job['jobId'])
                numeric_id(job['jobVersionId'])
            jobs.append({'jobId': job['jobId'], 'jobVersionId': job['jobVersionId'], 'status': job['status']})
        result.append({'companyId': company_id, 'slug': spec['slug'], 'jobs': jobs})
        print(f"  {spec['slug']}: company ID {company_id}, {len(jobs)} jobs")
    return {'companies': result, 'companyCount': len(result), 'jobCount': sum(len(item['jobs']) for item in result)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gateway-url', type=local_origin, default='http://localhost:8080')
    parser.add_argument('--mailpit-url', type=local_origin, default='http://localhost:8025')
    parser.add_argument('--recruiter-email', default='recruiter.demo@smart.local')
    parser.add_argument('--password-env', help='Optional name of a password variable; otherwise prompt without echo')
    parser.add_argument('--data', type=Path, default=Path(__file__).with_name('seed-portal-data.json'))
    parser.add_argument('--deadline-days', type=int, choices=range(1, 366), metavar='1..365', default=90)
    parser.add_argument('--draft-only', action='store_true', help='Create drafts without waiting for JD analysis/confirmation')
    parser.add_argument('--dry-run', action='store_true', help='Validate and summarize fixture; no HTTP, credentials or writes')
    args = parser.parse_args(argv)
    try:
        companies = load_fixture(args.data)
        if args.dry_run:
            print(f"Valid portal seed: {len(companies)} companies, {sum(len(item['jobs']) for item in companies)} jobs; API v2, generated numeric IDs, external AI disabled.")
            return 0
        password = os.environ[args.password_env] if args.password_env else getpass.getpass('Recruiter demo password: ')
        if not password:
            raise ValueError('A recruiter demo password is required')
        client = demo.HttpClient(args.gateway_url, args.mailpit_url)
        account = demo.ensure_account(client, args.recruiter_email, password, 'RECRUITER')
        numeric_id(account['userId'])
        if 'RECRUITER' not in account.get('roles', []):
            raise ValueError('Use a recruiter demo account')
        token = account['accessToken']
        if demo.get_or_none(client, '/api/v2/recruiter/profile', token) is None:
            client.json('PUT', '/api/v2/recruiter/profile', token=token,
                        payload={'displayName': 'Portal Demo Recruiter', 'businessTitle': 'Technical Recruiter', 'version': None})
        summary = seed_portal(client, token, companies, publish=not args.draft_only, deadline_days=args.deadline_days)
        print(f"Portal seed ready: {summary['companyCount']} demo companies, {summary['jobCount']} jobs.")
        return 0
    except demo.ApiFailure as error:
        print(f'Portal seed stopped: API HTTP {error.status}. Existing rows are preserved; rerun after resolving the response.', file=sys.stderr)
    except (ValueError, KeyError, OSError, RuntimeError, TimeoutError) as error:
        print(f'Portal seed stopped ({type(error).__name__}); check local API availability and fixture/credentials. No response body or credentials are printed.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
