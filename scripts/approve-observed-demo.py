#!/usr/bin/env python3
"""Approve only the observed-seed demo companies through the audited local API."""
import argparse
import getpass
import importlib.util
from pathlib import Path
import time

path = Path(__file__).with_name('seed-real-observed.py')
spec = importlib.util.spec_from_file_location('observed_seed', path)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


def approve(client, admin_token, recruiter_token):
    companies = client.json('GET', '/api/v2/companies', token=recruiter_token)
    count = 0
    for company in companies:
        if not company.get('slug', '').startswith('demo-observed-'):
            continue
        if company.get('description') != 'Hồ sơ demo từ tên nhà tuyển dụng quan sát được; chưa xác minh pháp nhân.':
            continue
        if company.get('status') != 'PENDING':
            continue
        company_id = seed.portal.numeric_id(company['companyId'])
        client.json('POST', f'/api/v2/dashboard/companies/{company_id}/approve', token=admin_token,
                    payload={'version': company['version'],
                             'reason': 'Duyệt hồ sơ demo phục vụ dữ liệu thử nghiệm; không xác nhận pháp nhân.'})
        count += 1
        if count % 10 == 0:
            print(f'Approved {count} demo companies.', flush=True)
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gateway-url', type=seed.portal.local_origin, default='http://localhost:8080')
    parser.add_argument('--admin-email')
    parser.add_argument('--recruiter-email', default='recruiter.demo@smart.local')
    parser.add_argument('--follow', action='store_true', help='Continue approving new demo companies while the seed runs')
    parser.add_argument('--expected-companies', type=int, default=899)
    args = parser.parse_args()
    admin_email = args.admin_email or input('Admin email: ').strip()
    if not admin_email:
        parser.error('Admin email is required')
    admin_password = getpass.getpass('Admin password: ')
    recruiter_password = getpass.getpass('Recruiter demo password: ')
    client = seed.demo.HttpClient(args.gateway_url, 'http://localhost:8025')
    try:
        admin = seed.demo.login(client, admin_email, admin_password)
        recruiter = seed.demo.login(client, args.recruiter_email, recruiter_password)
        if 'SYSTEM_ADMIN' not in admin.get('roles', []) or 'RECRUITER' not in recruiter.get('roles', []):
            raise ValueError('Admin and recruiter roles are required')
        while True:
            try:
                count = approve(client, admin['accessToken'], recruiter['accessToken'])
                companies = client.json('GET', '/api/v2/companies', token=recruiter['accessToken'])
            except seed.demo.ApiFailure as error:
                if not args.follow or error.status != 401:
                    raise
                admin = seed.demo.login(client, admin_email, admin_password)
                recruiter = seed.demo.login(client, args.recruiter_email, recruiter_password)
                continue
            demos = [company for company in companies if company.get('slug', '').startswith('demo-observed-')
                     and company.get('description') == 'Hồ sơ demo từ tên nhà tuyển dụng quan sát được; chưa xác minh pháp nhân.']
            print(f'Approved {count} this pass; {len(demos)} demo companies exist.', flush=True)
            if not args.follow or (len(demos) >= args.expected_companies
                                   and all(company.get('status') != 'PENDING' for company in demos)):
                break
            time.sleep(20)
    except (ValueError, KeyError, RuntimeError, OSError) as error:
        print(f'Approval stopped: {type(error).__name__}; already approved companies remain active.')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
