#!/usr/bin/env python3
"""Create local demo drafts from observed job metadata via Gateway API v2.

This does not scrape sites, read environment files, approve companies or confirm
ParsedJD revisions. The input is the reviewable evidence file, not a live feed.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from typing import Any

ROOT = Path(__file__).resolve().parent


def _load(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


portal = _load('real_seed_portal_helpers', ROOT / 'seed-portal.py')
merge = _load('real_seed_url_helpers', ROOT / 'merge-real-jobs.py')
demo = portal.demo
MARKER = '[Dữ liệu demo từ tin đã quan sát; trạng thái tuyển dụng chưa xác minh.]'
UNKNOWN_INDUSTRY = 'Chưa phân loại'
UNKNOWN_POSITION = 'Chưa xác định'
UNKNOWN_EMPLOYER = 'Nhà tuyển dụng chưa xác định'


def _key(value: str) -> str:
    return ' '.join(value.split()).casefold()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]


def load_observations(path: Path) -> tuple[list[dict], list[dict]]:
    payload = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(payload, dict) or payload.get('schemaVersion') != 'external-job-observations/1.0':
        raise ValueError('Expected external-job-observations/1.0')
    jobs = payload.get('jobs')
    if not isinstance(jobs, list):
        raise ValueError('Expected a jobs array')
    records, skipped, urls = [], [], set()
    for item in jobs:
        if not isinstance(item, dict) or not isinstance(item.get('observations'), list) or not item['observations']:
            raise ValueError('Each job needs source observations')
        observation = item['observations'][0]
        record = observation.get('record')
        context = observation.get('sourceContext') or {}
        if not isinstance(record, dict) or not isinstance(context, dict):
            raise ValueError('Invalid observation')
        url = merge.normalized_url(record.get('sourceUrl'))
        if url in urls or item.get('normalizedSourceUrl') != url:
            raise ValueError('Duplicate or inconsistent source URL')
        urls.add(url)
        title = record.get('title')
        if not isinstance(title, str) or not title.strip():
            raise ValueError('Missing observed job title')
        title = title.strip()
        if len(title) > 240:
            skipped.append({'sourceUrl': url, 'reason': 'title exceeds 240 characters'})
            continue
        employer = record.get('employer')
        if employer is not None and not isinstance(employer, str):
            raise ValueError('Invalid employer')
        employer = employer.strip() if employer and employer.strip() else UNKNOWN_EMPLOYER
        if len(employer) > 232:
            skipped.append({'sourceUrl': url, 'reason': 'employer exceeds demo company limit'})
            continue
        source = record.get('source') or context.get('source')
        if not isinstance(source, str) or not source.strip():
            raise ValueError('Missing source name')
        records.append({'url': url, 'title': title, 'employer': employer, 'source': source,
                        'location': record.get('location'),
                        'salaryText': record.get('salaryText') or record.get('salary'),
                        'deadline': record.get('applicationDeadline') or record.get('deadline')})

    counts: dict[tuple[str, str], int] = {}
    for item in records:
        key = (_key(item['employer']), item['title'])
        counts[key] = counts.get(key, 0) + 1
    accepted = []
    for item in records:
        if counts[(_key(item['employer']), item['title'])] > 1:
            title = f"{item['title']} [demo-{_hash(item['url'])[:8]}]"
            if len(title) > 240:
                skipped.append({'sourceUrl': item['url'], 'reason': 'duplicate title cannot fit identity suffix'})
                continue
            item['seedTitle'] = title
        else:
            item['seedTitle'] = item['title']
        accepted.append(item)
    return accepted, skipped


def company_spec(employer: str) -> dict:
    return {'legalName': employer, 'displayName': employer, 'slug': 'demo-observed-' + _hash(_key(employer)),
            'description': 'Hồ sơ demo từ tên nhà tuyển dụng quan sát được; chưa xác minh pháp nhân.',
            'countryCode': 'VN',
            'coverImageUrl': '/companies/photos/workplace.webp'}


def job_spec(item: dict, unknown_industry_id: str) -> dict:
    details = [MARKER, 'Mã tham chiếu dữ liệu: ' + _hash(item['url']), 'Mô tả công việc chưa được thu thập.',
               'Số lượng tuyển chưa xác minh; giá trị 1 chỉ là giá trị kỹ thuật cho demo.']
    if item['salaryText']:
        details.append('Lương ghi nhận từ nguồn: ' + str(item['salaryText']))
    if item['deadline']:
        details.append('Ngày hạn nộp ghi nhận từ nguồn (chưa xác minh): ' + str(item['deadline']))
    is_it = _key(item['source']) == 'itviec'
    category = {'industryId': '1' if is_it else unknown_industry_id,
                'positionName': UNKNOWN_POSITION}
    location = item['location'] if isinstance(item['location'], str) and len(item['location']) <= 300 else None
    return {'title': item['seedTitle'], 'description': '\n'.join(details),
            'requirementsText': 'Yêu cầu công việc chưa được thu thập.', 'benefitsText': None,
            'locationText': location, 'countryCode': 'VN', 'workMode': None, 'employmentType': None,
            'seniorityLevel': None, 'openings': 1, 'salaryMin': None, 'salaryMax': None,
            'salaryCurrency': None, 'salaryPeriod': None, 'salaryNegotiable': False,
            'externalAiConsent': False, 'applicationDeadline': None, 'category': category, 'version': None}


def resolve_unknown_industry(client: Any) -> str:
    entries = client.json('GET', '/api/v2/public/job-categories')
    found = [entry for entry in entries if entry.get('kind') == 'INDUSTRY' and entry.get('status') == 'ACTIVE'
             and _key(entry.get('name', '')) == _key(UNKNOWN_INDUSTRY)]
    if len(found) != 1 or found[0].get('id') == '1':
        raise ValueError('Admin must create one ACTIVE industry named Chưa phân loại before seeding')
    return portal.numeric_id(found[0]['id'])


def publish_manual(client: Any, token: str, job: dict) -> dict:
    if job['status'] == 'PUBLISHED':
        return job
    if job['status'] != 'DRAFT':
        raise ValueError('Existing demo job is not a draft')
    current = client.json('GET', f"/api/v2/jobs/{job['jobId']}", token=token)
    if current['status'] == 'PUBLISHED':
        return current
    return client.json('POST', f"/api/v2/jobs/{job['jobId']}/publish?version={current['version']}", token=token)


def seed(client: Any, token: str, records: list[dict], industry_id: str, *, publish: bool = False) -> dict:
    owned = client.json('GET', '/api/v2/companies', token=token)
    grouped: dict[str, list[dict]] = {}
    for item in records:
        grouped.setdefault(_key(item['employer']), []).append(item)
    result = {'companies': 0, 'jobs': 0, 'createdCompanies': 0, 'createdJobs': 0,
              'publishedJobs': 0, 'pendingCompanyJobs': 0, 'itDraftJobs': 0}
    for group in grouped.values():
        spec = company_spec(group[0]['employer'])
        matches = [company for company in owned if company['slug'] == spec['slug']]
        if len(matches) > 1:
            raise ValueError('Duplicate demo company slug')
        company = matches[0] if matches else client.json('POST', '/api/v2/companies', token=token, payload=spec)
        if matches and company.get('description') != spec['description']:
            raise ValueError('Existing demo company differs from fixture')
        if not matches:
            owned.append(company)
            result['createdCompanies'] += 1
        company_id = portal.numeric_id(company['companyId'])
        path = f'/api/v2/companies/{company_id}/jobs'
        existing = client.json('GET', path, token=token)
        for item in group:
            data = job_spec(item, industry_id)
            same = [job for job in existing if job['title'] == data['title']]
            if len(same) > 1:
                raise ValueError('Duplicate demo job title')
            job = same[0] if same else client.json('POST', path, token=token, payload=data)
            portal.numeric_id(job['jobId'])
            portal.numeric_id(job['jobVersionId'])
            if same and (not (job.get('description') or '').startswith(MARKER)
                         or 'Mã tham chiếu dữ liệu: ' + _hash(item['url']) not in job['description']):
                raise ValueError('Existing job does not have demo provenance marker')
            if not same:
                existing.append(job)
                result['createdJobs'] += 1
            if publish and job['status'] != 'PUBLISHED':
                if company.get('status') != 'ACTIVE':
                    result['pendingCompanyJobs'] += 1
                elif job.get('matchingSupported') is True:
                    # Missing JDs must never be silently confirmed as genuine IT JDs.
                    result['itDraftJobs'] += 1
                elif job.get('matchingSupported') is False:
                    job = publish_manual(client, token, job)
                    result['publishedJobs'] += 1
                else:
                    raise ValueError('Job response missing matchingSupported')
            result['jobs'] += 1
        result['companies'] += 1
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=Path('outputs/merged-external-jobs-final.json'))
    parser.add_argument('--gateway-url', type=portal.local_origin, default='http://localhost:8080')
    parser.add_argument('--recruiter-email', help='Existing recruiter account email')
    parser.add_argument('--password-env', help='Name of environment variable containing the recruiter password')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--publish', action='store_true', help='Publish manual jobs only for ACTIVE companies; IT stays draft')
    args = parser.parse_args(argv)
    try:
        records, skipped = load_observations(args.data)
        companies = len({_key(item['employer']) for item in records})
        print(f'Observed demo seed: {len(records)} jobs, {companies} demo companies; {len(skipped)} skipped for field limits.')
        if args.dry_run:
            return 0
        if not args.recruiter_email:
            parser.error('--recruiter-email is required unless --dry-run is used')
        client = demo.HttpClient(args.gateway_url, 'http://localhost:8025')
        industry_id = resolve_unknown_industry(client)
        password = os.environ[args.password_env] if args.password_env else getpass.getpass('Recruiter password: ')
        if not password:
            raise ValueError('Password required')
        account = demo.login(client, args.recruiter_email, password)
        if 'RECRUITER' not in account.get('roles', []):
            raise ValueError('Existing recruiter account required')
        result = seed(client, account['accessToken'], records, industry_id, publish=args.publish)
        print('Seed result: ' + json.dumps(result, ensure_ascii=True))
        return 0
    except (ValueError, KeyError, OSError, RuntimeError, TimeoutError) as error:
        print(f'Seed stopped ({type(error).__name__}): {error if isinstance(error, ValueError) else "check local API or credentials"}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    raise SystemExit(main())
