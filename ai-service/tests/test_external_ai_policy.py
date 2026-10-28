from identity_fixtures import legacy_id, new_id
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
import os

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.jd.parser import parse_jd
from app.shared.config import Settings
from app.shared.extraction import get_extractor, get_provider
from app.shared.extraction_privacy import professional_source
from app.shared.extraction_types import EXTERNAL_AI_POLICY_VERSION, ExtractionContext
from app.shared.extraction_usage import ExtractionDailyBudget, ExtractionUsage, ExtractionUsageRepository
from app.shared.groq import GroqExtractor


VERSION = str(legacy_id('779494ac-c858-4570-a884-6e88423b8e2b'))
SOURCE = "Backend Developer\nBuild Java services.\nJava is required."


def settings(**overrides):
    return Settings(_env_file=None, **({
        "db_url": "unused", "auth_jwks_uri": "unused", "auth_jwt_issuer": "unused",
        "auth_jwt_audience": "unused", "extraction_provider": "groq", "groq_enabled": True,
        "groq_api_key": "fake-test-key", "extraction_daily_call_limit": 100000,
        "extraction_user_daily_call_limit": 1,
    } | overrides))


def context(owner=None, *, granted=True, policy=EXTERNAL_AI_POLICY_VERSION):
    return ExtractionContext(owner or new_id(), new_id(), "a" * 64, granted, policy)


@pytest.fixture(params=["sqlite"] + (["postgresql"] if os.getenv("EXTRACTION_TEST_DB_URL") else []))
def budget_case(request, tmp_path):
    url = os.environ["EXTRACTION_TEST_DB_URL"] if request.param == "postgresql" else f"sqlite:///{tmp_path / 'budget.db'}"
    engine = create_engine(url)
    if request.param == "postgresql":
        assert engine.url.database == "ai_extraction_test", "Use only the dedicated QA extraction database"
    else:
        ExtractionDailyBudget.__table__.create(engine)
        ExtractionUsage.__table__.create(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    # A distinct day isolates the global quota without deleting retained QA data.
    now = datetime(2100, 1, 1, tzinfo=UTC) + timedelta(days=new_id() % 1000000)
    repo = ExtractionUsageRepository(factory, daily_limit=3, user_daily_limit=2)
    yield repo, factory, now
    engine.dispose()


def test_global_limit_shared_by_concurrent_users_and_persisted(budget_case):
    repo, factory, now = budget_case
    def reserve(_):
        return repo.reserve(context(), "jd", "groq", "test-model", now=now)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(reserve, range(8)))
    assert sum(key is not None for key, _ in results) == 3
    assert all(reason == "EXTERNAL_AI_LIMIT_REACHED" for key, reason in results if key is None)
    fresh = ExtractionUsageRepository(factory, daily_limit=3, user_daily_limit=2)
    assert fresh.reserve(context(), "cv", "gemini", "other-model", now=now)[1] == "EXTERNAL_AI_LIMIT_REACHED"
    assert fresh.reserve(context(), "cv", "gemini", "other-model", now=now + timedelta(days=1))[0]


def test_account_limit_rolls_back_global_counter(budget_case):
    repo, factory, now = budget_case
    owner = new_id()
    assert repo.reserve(context(owner), "jd", "groq", "m", now=now)[0]
    assert repo.reserve(context(owner), "cv", "gemini", "m", now=now)[0]
    assert repo.reserve(context(owner), "cv", "groq", "m", now=now)[1] == "EXTERNAL_AI_LIMIT_REACHED"
    assert repo.reserve(context(), "jd", "groq", "m", now=now)[0]
    with factory() as session:
        assert session.get(ExtractionDailyBudget, (now.date(), "global")).call_count == 3


def test_duplicate_documents_consume_one_admission(budget_case):
    repo, factory, now = budget_case
    item = context()
    def reserve(_):
        return repo.reserve(item, "cv", "groq", "m", now=now)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(reserve, range(3)))
    assert sum(key is not None for key, _ in results) == 1
    assert [reason for key, reason in results if key is None] == ["EXTERNAL_AI_ALREADY_REQUESTED"] * 2
    with factory() as session:
        assert session.get(ExtractionDailyBudget, (now.date(), "global")).call_count == 1


@pytest.mark.parametrize("granted,policy", [(False, None), (True, None), (True, "outdated"), (1, EXTERNAL_AI_POLICY_VERSION)])
def test_missing_or_invalid_consent_never_calls_network_or_budget(monkeypatch, granted, policy, budget_case):
    repo, factory, _ = budget_case
    item = context(granted=granted, policy=policy)
    monkeypatch.setattr(GroqExtractor, "_generate", lambda *args: pytest.fail("Network called"))
    client = get_extractor(settings(), context=item, session_factory=factory)
    result = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.", enricher=client)
    assert "EXTERNAL_AI_NOT_CONSENTED" in result["qualityFlags"]
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ExtractionUsage).where(
            ExtractionUsage.owner_user_id == item.owner_user_id)) == 0


def test_missing_context_or_budget_fails_closed(monkeypatch):
    monkeypatch.setattr(GroqExtractor, "_generate", lambda *args: pytest.fail("Network called"))
    for ctx, flag in [(None, "EXTERNAL_AI_NOT_CONSENTED"), (context(), "EXTERNAL_AI_BUDGET_UNAVAILABLE")]:
        result = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.",
                          enricher=get_extractor(settings(), context=ctx))
        assert flag in result["qualityFlags"]


def test_managed_extraction_records_safe_metadata_and_rejects_repeated_call(monkeypatch, budget_case):
    _, factory, _ = budget_case
    item = context()
    calls = []
    def generate(self, kind, source):
        calls.append(source)
        self.record_usage({"in": 42, "out": 10}, "in", "out")
        return {"requiredSkills": ["Java is required."], "preferredSkills": [], "excludedSkills": [],
                "responsibilities": ["Build Java services."], "requiredSkillNames": ["Java"], "preferredSkillNames": []}
    monkeypatch.setattr(GroqExtractor, "_generate", generate)
    client = get_extractor(settings(), context=item, session_factory=factory)
    baseline = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.")
    result = client("jd", SOURCE + "\nEmail: private@example.test", baseline)
    assert "GROQ_ASSISTED_EXTRACTION" in result["qualityFlags"]
    assert "EXTERNAL_AI_ALREADY_REQUESTED" in client("jd", SOURCE, baseline)["qualityFlags"]
    assert len(calls) == 1 and "private@example.test" not in calls[0]
    with factory() as session:
        record = session.scalar(select(ExtractionUsage).where(ExtractionUsage.resource_id == item.resource_id))
        assert (record.outcome, record.input_tokens, record.output_tokens) == ("SUCCEEDED", 42, 10)
        assert not {"prompt", "response", "source_text", "object_ref", "api_key"} & set(record.__table__.columns.keys())


def test_quota_failure_preserves_rules_and_does_not_call_provider(monkeypatch, budget_case):
    _, factory, _ = budget_case
    monkeypatch.setattr(GroqExtractor, "_generate", lambda *args: pytest.fail("Network called"))
    result = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.",
                      enricher=get_extractor(settings(extraction_daily_call_limit=0), context=context(), session_factory=factory))
    assert "EXTERNAL_AI_LIMIT_REACHED" in result["qualityFlags"]
    assert result["requirements"]["requiredSkills"][0]["raw"] == "Java"


def test_provider_failure_is_recorded_without_sensitive_logs(monkeypatch, budget_case, caplog):
    _, factory, _ = budget_case
    item = context()
    def fail(*args):
        raise TimeoutError("private@example.test fake-test-key")
    monkeypatch.setattr(GroqExtractor, "_generate", fail)
    result = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.",
                      enricher=get_extractor(settings(), context=item, session_factory=factory))
    assert "GROQ_FALLBACK" in result["qualityFlags"]
    assert "private@example.test" not in caplog.text and "fake-test-key" not in caplog.text
    with factory() as session:
        record = session.scalar(select(ExtractionUsage).where(ExtractionUsage.resource_id == item.resource_id))
        assert record.outcome == "FALLBACK"


def test_budget_storage_failure_prevents_outbound_request(monkeypatch, budget_case, caplog):
    _, factory, _ = budget_case
    def unavailable(*args):
        raise RuntimeError("private@example.test fake-test-key")
    monkeypatch.setattr(ExtractionUsageRepository, "reserve", unavailable)
    monkeypatch.setattr(GroqExtractor, "_generate", lambda *args: pytest.fail("Network called"))
    result = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.",
                      enricher=get_extractor(settings(), context=context(), session_factory=factory))
    assert "EXTERNAL_AI_BUDGET_UNAVAILABLE" in result["qualityFlags"]
    assert "private@example.test" not in caplog.text and "fake-test-key" not in caplog.text


def test_audit_failure_does_not_repeat_provider_call(monkeypatch, budget_case, caplog):
    _, factory, _ = budget_case
    item = context()
    calls = []
    def generate(*args):
        calls.append(1)
        return {"requiredSkills": ["Java is required."], "preferredSkills": [], "excludedSkills": [],
                "responsibilities": ["Build Java services."], "requiredSkillNames": ["Java"], "preferredSkillNames": []}
    def unavailable(*args):
        raise RuntimeError("private@example.test fake-test-key")
    monkeypatch.setattr(GroqExtractor, "_generate", generate)
    monkeypatch.setattr(ExtractionUsageRepository, "finish", unavailable)
    client = get_extractor(settings(), context=item, session_factory=factory)
    baseline = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.")
    assert "GROQ_ASSISTED_EXTRACTION" in client("jd", SOURCE, baseline)["qualityFlags"]
    assert "EXTERNAL_AI_ALREADY_REQUESTED" in client("jd", SOURCE, baseline)["qualityFlags"]
    assert calls == [1]
    assert "private@example.test" not in caplog.text and "fake-test-key" not in caplog.text
    with factory() as session:
        assert session.scalar(select(ExtractionUsage).where(ExtractionUsage.resource_id == item.resource_id)).outcome == "RESERVED"


def test_privacy_filter_removes_header_private_sections_and_preserves_offsets():
    source = "Nguyen Van A\nContact\nprivate@example.test\nSkills\nJava, SQL\nReferences\nTran Van B\nExperience\nBuild Java services."
    filtered = professional_source("cv", source)
    assert len(source) == len(filtered)
    assert not any(value in filtered for value in ["Nguyen Van A", "private@example.test", "Tran Van B"])
    quote = "Build Java services."
    assert source.index(quote) == filtered.index(quote)
    assert "Java, SQL" in filtered


def test_unrecognized_cv_layout_uses_local_parser_without_network(monkeypatch):
    client = get_provider(settings())
    monkeypatch.setattr(client, "_generate", lambda *args: pytest.fail("Network called"))
    baseline = {"summary": {"qualityFlags": []}, "document": {"parserVersion": "rules"}}
    result = client("cv", "Nguyen Van A\nContact me at private@example.test", baseline)
    assert "EXTERNAL_AI_NO_PROFESSIONAL_CONTENT" in result["summary"]["qualityFlags"]


def test_model_is_configurable_but_url_injection_rejected():
    assert get_provider(settings(groq_model="vendor/new-model")).model == "vendor/new-model"
    for model in ["https://example.test/model?key=x", "bad model", "x" * 121]:
        with pytest.raises(ValueError):
            settings(groq_model=model)


def test_cv_and_jd_can_select_different_providers_without_cross_provider_failover():
    options = settings(cv_extraction_provider="gemini", jd_extraction_provider="groq", gemini_enabled=True)
    assert get_provider(options, kind="cv").provider == "gemini"
    assert get_provider(options, kind="jd").provider == "groq"
    assert get_provider(settings(cv_extraction_provider="rules"), kind="cv") is None


def test_disabled_external_provider_keeps_local_review_with_clear_flag():
    options = settings(groq_enabled=False, gemini_enabled=True)
    result = parse_jd(VERSION, "a" * 64, "Backend Developer", "Build Java services.", "Java is required.",
                      enricher=get_extractor(options, context=context(), kind="jd"))
    assert "EXTERNAL_AI_NOT_CONFIGURED" in result["qualityFlags"]
    assert "GEMINI_ASSISTED_EXTRACTION" not in result["qualityFlags"]
