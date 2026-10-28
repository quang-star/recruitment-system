from identity_fixtures import new_id
import argparse
from contextlib import contextmanager
import json
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.reprocessing import source_state
from app.reprocessing.api import get_service, router
from app.reprocessing.cli import api_url
from app.reprocessing.models import CreateBatchRequest, EligibilityRequest, safe_reason
from app.reprocessing.source_state import HttpSourceStateReader, ReprocessingFailure
from app.shared.api import install_api_conventions
from app.shared.config import get_settings
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token
from test_reprocessing import case as shared_case  # noqa: F401 - shared synthetic fixture


@pytest.fixture
def client(request):
    case = request.getfixturevalue("shared_case")
    app = FastAPI()
    install_api_conventions(app)
    app.include_router(router)

    def session():
        with case.factory() as value:
            yield value

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_settings] = lambda: case.settings
    app.dependency_overrides[get_service] = lambda: case.service
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(case.actor, ("SYSTEM_ADMIN",))
    with TestClient(app) as value:
        yield value, app, case


def test_admin_api_preview_dispatch_step_checkpoint_history_and_attempt_metadata(client):
    api, _, case = client
    request = {"operation": "PARSE_CV", "resourceIds": [str(case.cv)], "asOfMonth": "2026-10"}
    impact = api.post("/api/v2/taxonomy/reprocessing/impact", json=request)
    assert impact.status_code == 200
    body = impact.json()
    assert body["selectionComplete"] and body["total"] == 1 and body["items"][0]["requiresLiveCheck"]
    assert "sourceHash" not in str(body) and str(case.owner) not in str(body)
    headers = {"Idempotency-Key": "synthetic-dispatch", "X-Correlation-Id": str(uuid4())}
    request.update(reason="Synthetic operator refresh", previewHash=body["previewHash"])
    response = api.post("/api/v2/taxonomy/reprocessing/batches", json=request, headers=headers)
    assert response.status_code == 200
    batch = response.json()
    path = "/api/v2/taxonomy/reprocessing/batches/" + batch["batchId"]
    assert api.post("/api/v2/taxonomy/reprocessing/batches", json=request, headers=headers).json()["batchId"] == batch["batchId"]
    result = api.post(path + "/step", headers={"Authorization": "Bearer synthetic-only"})
    assert result.status_code == 200 and result.json()["batch"]["counts"] == {"COMPLETED": 1}
    assert result.json()["batch"]["items"][0]["reviewRequired"]
    assert not api.post(path + "/step").json()["claimed"]
    assert api.get(path, params={"size": 101}).status_code == 422
    assert api.get(path, params={"page": 100001}).status_code == 422
    assert api.get(path, params={"page": 1, "size": 1}).json()["items"] == []
    history = api.get(path + "/history").json()["items"]
    assert len(history) == 1 and history[0]["correlationId"] == headers["X-Correlation-Id"]
    assert history[0]["reason"] == "Synthetic operator refresh"
    item = result.json()["itemId"]
    attempts = api.get(path + "/items/" + item + "/attempts").json()
    assert len(attempts) == 1 and attempts[0]["outcome"] == "COMPLETED"
    assert "Bearer" not in str(attempts) and "lease" not in str(attempts)
    assert api.get(path + f"/items/{new_id()}/attempts").status_code == 404


@pytest.mark.parametrize("role", ["CANDIDATE", "RECRUITER"])
def test_other_roles_cannot_preview_dispatch_operate_or_read_metadata(client, role):
    api, app, case = client
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(case.actor, (role,))
    base = "/api/v2/taxonomy/reprocessing"
    for method, path, body in (("post", "/impact", {"operation": "PARSE_CV"}),
                               ("post", "/batches", {"operation": "PARSE_CV", "reason": "Synthetic", "previewHash": "a" * 64}),
                               ("post", f"/batches/{new_id()}/step", None), ("get", f"/batches/{new_id()}", None)):
        response = getattr(api, method)(base + path, json=body) if method == "post" else api.get(base + path)
        assert response.status_code == 403
    assert case.reads == [] and case.reader.calls == []


def test_missing_auth_and_invalid_selection_do_not_claim_work(client):
    api, app, _ = client
    assert api.post("/api/v2/taxonomy/reprocessing/impact", json={"operation": "RESEARCH"}).status_code == 422
    assert api.post("/api/v2/taxonomy/reprocessing/impact", json={"operation": "PARSE_CV", "externalAi": True}).status_code == 422
    assert api.post("/api/v2/taxonomy/reprocessing/impact", json={"operation": "PARSE_CV", "resourceIds": []}).status_code == 422
    app.dependency_overrides.pop(require_access_token)
    assert api.get(f"/api/v2/taxonomy/reprocessing/batches/{new_id()}").status_code == 401


@pytest.mark.parametrize("reason", ["ｃａｎｄｉｄａｔｅ＠ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ", "owner@synthetic.invalid and ｏｗｎｅｒ＠ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ",
                                  "ｈｔｔｐｓ：／／ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ／ｃｖ", "Phone: 0901234567"])
def test_operator_reasons_mask_raw_fullwidth_and_mixed_contacts(reason):
    masked = safe_reason(reason)
    assert masked != reason and "synthetic.invalid" not in masked and "ｓｙｎｔｈｅｔｉｃ" not in masked
    request = CreateBatchRequest(operation="PARSE_CV", reason=reason, previewHash="a" * 64)
    assert request.reason == masked


@pytest.mark.parametrize("url", ["https://user:password@synthetic.invalid", "http://evil.invalid", "https://synthetic.invalid/path", "https://synthetic.invalid/?token=value"])
def test_cli_origin_validation_refuses_credentials_cleartext_remote_and_path_injection(url):
    with pytest.raises(argparse.ArgumentTypeError):
        api_url(url)
    assert api_url("http://127.0.0.1:28080") == "http://127.0.0.1:28080/api/v2/taxonomy/reprocessing"


def test_core_reader_uses_fixed_post_endpoint_bounded_json_and_ephemeral_bearer(monkeypatch):
    captured = []

    class Opener:
        @contextmanager
        def open(self, request, timeout):
            captured.append((request, timeout))
            yield type("Response", (), {"read": lambda _, limit: b'{"eligible":true,"reasonCode":"LIVE"}'})()

    monkeypatch.setattr(source_state, "build_opener", lambda *_: Opener())
    reader = HttpSourceStateReader("http://core-service:8082/api/v2/dashboard/reprocessing/eligibility", 1)
    request = EligibilityRequest(operation="PARSE_CV", resourceId=new_id(), sourceOwnerId=new_id(), sourceHash="a" * 64)
    result = reader.check(request, "Bearer synthetic-only")
    assert result.eligible and len(captured) == 1
    message, timeout = captured[0]
    assert message.get_method() == "POST" and timeout == 1 and message.headers["Authorization"] == "Bearer synthetic-only"
    assert json.loads(message.data)["resourceId"] == str(request.resourceId)
    assert reader.__dict__ == {"url": "http://core-service:8082/api/v2/dashboard/reprocessing/eligibility", "timeout": 1}
    assert isinstance(request.resourceId, int)


@pytest.mark.parametrize("payload", [b'{"eligible":true,"reasonCode":"ACCESS_REVOKED"}', b'{"eligible":"true","reasonCode":"LIVE"}',
                                    b'{"eligible":true,"reasonCode":"LIVE","ownerId":"private"}', b'not JSON', b'x' * 16385])
def test_bad_core_response_is_a_safe_bounded_retryable_failure(monkeypatch, payload):
    class Opener:
        @contextmanager
        def open(self, *_args, **_kwargs):
            yield type("Response", (), {"read": lambda _, limit: payload})()

    monkeypatch.setattr(source_state, "build_opener", lambda *_: Opener())
    reader = HttpSourceStateReader("http://core-service:8082/api/v2/dashboard/reprocessing/eligibility")
    with pytest.raises(ReprocessingFailure) as error:
        reader.check(EligibilityRequest(operation="MATCH_APPLICATION", resourceId=new_id()), "Bearer synthetic-only")
    assert error.value.code == "CORE_ELIGIBILITY_UNAVAILABLE" and error.value.retryable
    assert "private" not in str(error.value)
