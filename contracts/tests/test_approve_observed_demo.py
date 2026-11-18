"""Only explicitly marked owned demo tenants may be bulk approved."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('approve_observed', Path(__file__).resolve().parents[2] / 'scripts/approve-observed-demo.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_approves_only_pending_marked_demo_companies():
    desc = 'Hồ sơ demo từ tên nhà tuyển dụng quan sát được; chưa xác minh pháp nhân.'
    class Client:
        def __init__(self):
            self.calls = []
        def json(self, method, path, **kwargs):
            self.calls.append((method, path, kwargs))
            if method == 'GET':
                return [
                    {'companyId': '1', 'slug': 'demo-observed-a', 'description': desc, 'status': 'PENDING', 'version': 0},
                    {'companyId': '2', 'slug': 'real-company', 'description': desc, 'status': 'PENDING', 'version': 0},
                    {'companyId': '3', 'slug': 'demo-observed-b', 'description': 'other', 'status': 'PENDING', 'version': 0},
                    {'companyId': '4', 'slug': 'demo-observed-c', 'description': desc, 'status': 'ACTIVE', 'version': 1},
                ]
            return {}
    client = Client()
    assert module.approve(client, 'admin', 'recruiter') == 1
    assert [call[1] for call in client.calls if call[0] == 'POST'] == ['/api/v2/dashboard/companies/1/approve']
    assert client.calls[-1][2]['payload']['version'] == 0
