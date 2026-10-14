from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from pydantic import SecretStr

from app.cv.parser import parse_pdf
from app.jd.parser import parse_jd
from app.shared import gemini
from app.shared.config import Settings
from app.shared.gemini import GeminiExtractor, _contract, redact_contacts


VERSION = "779494ac-c858-4570-a884-6e88423b8e2b"
DESCRIPTION = "Build Java services."
REQUIREMENTS = "Java is essential. Kafka would be a bonus."
SOURCE = f"Backend Developer\n{DESCRIPTION}\n{REQUIREMENTS}"


def extractor(**overrides):
    values = dict(gemini_enabled=True, gemini_api_key=SecretStr("test-key-not-real"),
                  gemini_backup_api_key=SecretStr(""),
                  gemini_model="gemini-2.5-flash", gemini_timeout_seconds=2,
                  gemini_max_input_chars=30000)
    values.update(overrides)
    return GeminiExtractor(SimpleNamespace(**values))


def baseline():
    return parse_jd(VERSION, "a" * 64, "Backend Developer", DESCRIPTION, REQUIREMENTS)


def sections():
    return {"requiredSkills": ["Java is essential."],
            "preferredSkills": ["Kafka would be a bonus."], "excludedSkills": [],
            "responsibilities": [DESCRIPTION], "requiredSkillNames": ["Java"], "preferredSkillNames": ["Kafka"]}


def test_jd_gemini_reclassifies_bonus_skill_and_preserves_contract(monkeypatch):
    client = extractor()
    monkeypatch.setattr(client, "_generate", lambda *args: sections())
    original = baseline()
    before = deepcopy(original)
    result = client("jd", SOURCE, original)
    assert original == before
    assert [skill["raw"] for skill in result["requirements"]["preferredSkills"]] == ["Kafka"]
    assert result["document"]["parserVersion"].endswith("+gemini-gemini-2.5-flash-v4")
    assert "GEMINI_REVIEW_REQUIRED" in result["qualityFlags"]
    _contract("jd").validate(result)
    location = result["evidence"][-1]
    assert SOURCE[location["start"]:location["end"]] == DESCRIPTION


@pytest.mark.parametrize("response", [
    {}, [], {**sections(), "extra": "unexpected"},
    {**sections(), "preferredSkills": ["AWS required"]},
    {**sections(), "requiredSkills": ["Kafka would be a bonus."]},
    {key: [] for key in sections()},
])
def test_invalid_or_ungrounded_results_fall_back_without_mutation(monkeypatch, response):
    client = extractor()
    monkeypatch.setattr(client, "_generate", lambda *args: response)
    original = baseline()
    result = client("jd", SOURCE, original)
    assert result == {**original, "qualityFlags": [*original["qualityFlags"], "GEMINI_FALLBACK"]}


@pytest.mark.parametrize("error", [TimeoutError(), HTTPError("https://example.test", 429, "private", {}, None)])
def test_provider_failure_does_not_fail_parser_or_log_sensitive_data(monkeypatch, caplog, error):
    client = extractor()
    def fail(*args):
        raise error
    monkeypatch.setattr(client, "_generate", fail)
    result = parse_jd(VERSION, "a" * 64, "Backend Developer", DESCRIPTION, REQUIREMENTS, enricher=client)
    assert "GEMINI_FALLBACK" in result["qualityFlags"]
    assert "private" not in caplog.text


@pytest.mark.parametrize("options,flag", [
    ({"gemini_enabled": False}, None),
    ({"gemini_api_key": SecretStr("")}, "GEMINI_NOT_CONFIGURED"),
    ({"gemini_max_input_chars": 5}, "GEMINI_INPUT_SKIPPED"),
])
def test_disabled_missing_key_and_large_inputs_never_call_network(monkeypatch, options, flag):
    client = extractor(**options)
    calls = []
    monkeypatch.setattr(client, "_generate", lambda *args: calls.append(args))
    original = baseline()
    result = client("jd", SOURCE, original)
    assert calls == []
    assert flag in result["qualityFlags"] if flag else result == original


def test_contact_redaction_preserves_offsets_and_employment_dates():
    text = "Name: Sample Person\na@example.test +84912345678\nhttps://example.test\n2022 - 2024\n01/2022 - 12/2024"
    masked = redact_contacts(text)
    assert len(masked) == len(text)
    assert "Sample Person" not in masked and "a@example.test" not in masked
    assert "84912345678" not in masked and "https://" not in masked
    assert "2022 - 2024" in masked and "01/2022 - 12/2024" in masked


def test_cv_extracts_unusual_education_heading_with_original_evidence(monkeypatch):
    text = "Academic journey\nBachelor Computer Science 2018 - 2022\nCareer\nBackend Developer 2022 - 2024\nBuild Java services."
    monkeypatch.setattr("app.cv.parser.PdfReader", lambda _: SimpleNamespace(
        pages=[SimpleNamespace(extract_text=lambda: text)]))
    client = extractor()
    monkeypatch.setattr(client, "_generate", lambda *args: {
        "experiences": ["Backend Developer 2022 - 2024\nBuild Java services."],
        "education": ["Bachelor Computer Science 2018 - 2022"],
        "languages": [], "projects": [], "certificates": [], "skillNames": ["Java"],
    })
    result = parse_pdf(VERSION, "a" * 64, b"mock", ocr_enabled=False, enricher=client)
    _contract("cv").validate(result)
    assert result["education"][0]["startMonth"] == "2018-01"
    assert result["experiences"][0]["startMonth"] == "2022-01"
    assert result["summary"]["totalExperienceMonths"] == 36
    assert "GEMINI_ASSISTED_EXTRACTION" in result["summary"]["qualityFlags"]
    evidence_id = result["education"][0]["evidenceIds"][0]
    location = next(item for item in result["evidence"] if item["id"] == evidence_id)
    assert text[location["start"]:location["end"]] == "Bachelor Computer Science 2018 - 2022"


@pytest.mark.parametrize("finish", ["STOP", "MAX_TOKENS", "SAFETY"])
def test_rest_request_and_response_boundary(monkeypatch, finish):
    calls = []
    response = {"candidates": [{"finishReason": finish, "content": {"parts": [
        {"text": "internal reasoning", "thought": True}, {"text": json.dumps(sections())},
    ]}}]}
    def open_request(request, timeout):
        calls.append((request, timeout))
        return BytesIO(json.dumps(response).encode())
    monkeypatch.setattr(gemini, "build_opener", lambda *args: SimpleNamespace(open=open_request))
    result = extractor()("jd", SOURCE, baseline())
    request, timeout = calls[0]
    assert timeout == 2
    assert "test-key" not in request.full_url
    assert request.get_header("X-goog-api-key") == "test-key-not-real"
    body = json.loads(request.data)
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert "tools" not in body
    flag = "GEMINI_ASSISTED_EXTRACTION" if finish == "STOP" else "GEMINI_FALLBACK"
    assert flag in result["qualityFlags"]


def test_key_is_hidden_in_settings_representation():
    settings = Settings(db_url="unused", auth_jwks_uri="unused", auth_jwt_issuer="unused",
                        auth_jwt_audience="unused", gemini_api_key="test-key-not-real")
    assert "test-key-not-real" not in repr(settings)


def test_cv_disabled_is_identical_to_existing_parser():
    fixture = Path(__file__).parent / "fixtures" / "minimal-cv.pdf"
    args = VERSION, "a" * 64, fixture.read_bytes()
    assert parse_pdf(*args, ocr_enabled=False, enricher=extractor(gemini_enabled=False)) == parse_pdf(
        *args, ocr_enabled=False,
    )


@pytest.mark.parametrize("status,attempts", [(401, 2), (403, 2), (429, 1), (503, 1), (400, 1)])
def test_backup_only_after_authorization_rejection(monkeypatch, status, attempts):
    client = extractor(gemini_backup_api_key=SecretStr("test-backup-not-real"))
    calls = []
    def request(model, body, key):
        calls.append(key)
        if len(calls) == 1:
            raise HTTPError("https://example.test", status, "private", {}, None)
        return sections()
    monkeypatch.setattr(client, "_request", request)
    result = client("jd", SOURCE, baseline())
    assert len(calls) == attempts
    if attempts == 2:
        assert calls[-1] == "test-backup-not-real"
        assert "GEMINI_ASSISTED_EXTRACTION" in result["qualityFlags"]
    else:
        assert "GEMINI_FALLBACK" in result["qualityFlags"]


def test_backup_can_be_used_without_primary_and_duplicate_keys_are_not_retried(monkeypatch):
    client = extractor(gemini_api_key=SecretStr(""), gemini_backup_api_key=SecretStr("test-backup-not-real"))
    calls = []
    def request(model, body, key):
        calls.append(key)
        return sections()
    monkeypatch.setattr(client, "_request", request)
    assert "GEMINI_ASSISTED_EXTRACTION" in client("jd", SOURCE, baseline())["qualityFlags"]
    assert calls == ["test-backup-not-real"]
    assert extractor(gemini_backup_api_key=SecretStr("test-key-not-real"))._keys() == ["test-key-not-real"]
