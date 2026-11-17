from copy import deepcopy
from io import BytesIO
import json
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest

from app.career.providers import career_provider
from app.jd.parser import parse_jd
from app.extraction import router9
from app.shared.config import Settings
from app.extraction.policy import get_extractor, get_provider
from app.extraction.contracts import EXTERNAL_AI_POLICY_VERSION, ExtractionContext
from app.extraction.router9 import Router9Extractor


def settings(**overrides):
    return Settings(_env_file=None, _env_prefix="SYNTHETIC_QA_", **({
        "db_url": "unused", "auth_jwks_uri": "unused", "auth_jwt_issuer": "unused",
        "auth_jwt_audience": "unused", "extraction_provider": "router9", "router9_enabled": True,
        "router9_api_key": "fake-test-key", "router9_model": "synthetic-model",
    } | overrides))


def baseline():
    return parse_jd("1", "a" * 64, "Backend Developer", "", "Java is required.")


def sections():
    return {"requiredSkills": ["Java is required."], "preferredSkills": [], "excludedSkills": [],
            "responsibilities": [], "requiredSkillNames": ["Java"], "preferredSkillNames": []}


def install_response(monkeypatch, payload):
    calls = []
    def open_request(request, timeout):
        calls.append((request, timeout))
        return BytesIO(json.dumps(payload).encode())
    monkeypatch.setattr(router9, "build_opener", lambda *args: SimpleNamespace(open=open_request))
    return calls


def test_selection_is_explicit_and_disabled_by_default():
    assert isinstance(get_provider(settings()), Router9Extractor)
    assert get_provider(settings(router9_enabled=False)) is None
    assert get_provider(settings(cv_extraction_provider="rules"), kind="cv") is None
    assert career_provider(settings()).provider == "router9"


def test_transport_preserves_grounding_and_records_usage(monkeypatch):
    calls = install_response(monkeypatch, {
        "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(sections())}}],
        "usage": {"prompt_tokens": 42, "completion_tokens": 12},
    })
    client = Router9Extractor(settings())
    original = baseline()
    before = deepcopy(original)
    result = client("jd", "Java is required.\nEmail: private@example.test", original)
    assert original == before
    assert "ROUTER9_ASSISTED_EXTRACTION" in result["qualityFlags"]
    assert "+router9-synthetic-model-v4" in result["document"]["parserVersion"]
    assert client.usage == {"input_tokens": 42, "output_tokens": 12}
    request, timeout = calls[0]
    assert len(calls) == 1 and timeout == 25
    assert request.full_url == "http://localhost:20128/v1/chat/completions"
    body = json.loads(request.data)
    assert body["model"] == "synthetic-model"
    assert body["max_tokens"] == 4096
    assert body["response_format"]["json_schema"]["strict"] is True
    assert "private@example.test" not in body["messages"][1]["content"]
    assert "fake-test-key" not in request.full_url


@pytest.mark.parametrize("payload", [
    {"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]},
    {"choices": [{"finish_reason": "stop", "message": {"content": "invalid JSON"}}]},
    {"choices": [{"finish_reason": "stop", "message": {"refusal": "refused", "content": "{}"}}]},
    {"error": {"message": "private provider error"}},
    {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(
        sections() | {"requiredSkills": ["Invented requirement"]})}}]},
])
def test_invalid_responses_fall_back(monkeypatch, payload):
    calls = install_response(monkeypatch, payload)
    original = baseline()
    result = Router9Extractor(settings())("jd", "Java is required.", original)
    assert result["requirements"] == original["requirements"]
    assert "ROUTER9_FALLBACK" in result["qualityFlags"]
    assert len(calls) == 1


@pytest.mark.parametrize("url", [
    "http://external.example/v1", "https://user:password@example.test/v1",
    "https://example.test/v1?key=private", "https://example.test/v1#fragment", "file:///tmp/router",
])
def test_unsafe_endpoints_never_send(monkeypatch, url):
    monkeypatch.setattr(router9, "build_opener", lambda *args: pytest.fail("Network called"))
    result = Router9Extractor(settings(router9_base_url=url))("jd", "Java is required.", baseline())
    assert "ROUTER9_FALLBACK" in result["qualityFlags"]


@pytest.mark.parametrize("override", [{"router9_api_key": ""}, {"router9_model": ""}])
def test_missing_configuration_never_sends(monkeypatch, override):
    monkeypatch.setattr(router9, "build_opener", lambda *args: pytest.fail("Network called"))
    result = Router9Extractor(settings(**override))("jd", "Java is required.", baseline())
    assert "ROUTER9_NOT_CONFIGURED" in result["qualityFlags"]


def test_consent_and_budget_still_required(monkeypatch):
    monkeypatch.setattr(router9, "build_opener", lambda *args: pytest.fail("Network called"))
    for context, flag in [
        (None, "EXTERNAL_AI_NOT_CONSENTED"),
        (ExtractionContext(1, 1, "a" * 64, True, EXTERNAL_AI_POLICY_VERSION), "EXTERNAL_AI_BUDGET_UNAVAILABLE"),
    ]:
        result = get_extractor(settings(), context=context)("jd", "Java is required.", baseline())
        assert flag in result["qualityFlags"]


@pytest.mark.parametrize("error", [TimeoutError("private"), HTTPError("http://localhost", 429, "private", {}, None)])
def test_network_errors_do_not_retry_or_log_secrets(monkeypatch, caplog, error):
    calls = []
    def fail(*args, **kwargs):
        calls.append(True)
        raise error
    monkeypatch.setattr(router9, "build_opener", lambda *args: SimpleNamespace(open=fail))
    result = Router9Extractor(settings())("jd", "Java is required.", baseline())
    assert "ROUTER9_FALLBACK" in result["qualityFlags"]
    assert len(calls) == 1
    assert "private" not in caplog.text and "fake-test-key" not in caplog.text
