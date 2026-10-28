from identity_fixtures import new_id
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
import os

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.career.models import CareerRequest
from app.career.service import CareerSuggestionService, draft_identity
from app.shared.extraction_types import EXTERNAL_AI_POLICY_VERSION, ExtractionContext
from app.shared.extraction_usage import (
    ExtractionDailyBudget,
    ExtractionUsage,
    ExtractionUsageRepository,
)
from test_career_suggestions import fixtures, request


@pytest.fixture(
    params=["sqlite"] + (["postgresql"] if os.getenv("EXTRACTION_TEST_DB_URL") else [])
)
def career_budget(request, tmp_path):
    url = (
        os.environ["EXTRACTION_TEST_DB_URL"]
        if request.param == "postgresql"
        else f"sqlite:///{tmp_path / 'career.db'}"
    )
    engine = create_engine(url)
    if request.param == "postgresql":
        assert engine.url.database == "ai_extraction_test", (
            "Only the dedicated synthetic QA database is allowed"
        )
    else:
        ExtractionDailyBudget.__table__.create(engine)
        ExtractionUsage.__table__.create(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    now = datetime(2100, 1, 1, tzinfo=UTC) + timedelta(days=new_id() % 1000000)
    repository = ExtractionUsageRepository(factory, daily_limit=3, user_daily_limit=2)
    yield repository, factory, now
    engine.dispose()


def test_classification_and_extraction_use_distinct_dedupe_but_share_daily_counters(
    career_budget,
):
    repository, factory, now = career_budget
    actor = new_id()
    draft = CareerRequest(title="Backend")
    identity = draft_identity(actor, draft.input_hash(), "a" * 64)
    classification = ExtractionContext(
        actor, identity, draft.input_hash(), True, EXTERNAL_AI_POLICY_VERSION
    )
    extraction = ExtractionContext(
        actor, new_id(), draft.input_hash(), True, EXTERNAL_AI_POLICY_VERSION
    )
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(
            pool.map(
                lambda _: repository.reserve(
                    classification, "jd", "groq", "synthetic-model", now=now
                ),
                range(3),
            )
        )
    assert sum(key is not None for key, _ in results) == 1
    assert [reason for key, reason in results if key is None] == [
        "EXTERNAL_AI_ALREADY_REQUESTED"
    ] * 2
    assert repository.reserve(extraction, "jd", "groq", "synthetic-model", now=now)[0]
    other_draft = ExtractionContext(
        actor, new_id(), "b" * 64, True, EXTERNAL_AI_POLICY_VERSION
    )
    assert (
        repository.reserve(other_draft, "jd", "groq", "synthetic-model", now=now)[1]
        == "EXTERNAL_AI_LIMIT_REACHED"
    )
    another_actor = ExtractionContext(
        new_id(), new_id(), "c" * 64, True, EXTERNAL_AI_POLICY_VERSION
    )
    assert repository.reserve(another_actor, "cv", "groq", "synthetic-model", now=now)[
        0
    ]
    with factory() as session:
        assert (
            session.get(ExtractionDailyBudget, (now.date(), "global")).call_count == 3
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(ExtractionUsage)
                .where(ExtractionUsage.owner_user_id == actor)
            )
            == 2
        )


def test_service_admission_is_durable_and_duplicate_never_calls_provider_again(
    career_budget,
):
    repository, factory, now = career_budget
    reader, provider, _ = fixtures()

    class ClockedBudget:
        def reserve(self, *args):
            return repository.reserve(*args, now=now)

        def finish(self, *args):
            repository.finish(*args)

    service = CareerSuggestionService(reader, provider, ClockedBudget())
    actor = new_id()
    first = service.suggest(actor, request())
    second = service.suggest(actor, request())
    assert (
        first.status == "SUGGESTED"
        and second.reasonCode == "EXTERNAL_AI_ALREADY_REQUESTED"
    )
    provider.generate.assert_called_once()
    with factory() as session:
        usage = session.scalar(
            select(ExtractionUsage).where(ExtractionUsage.owner_user_id == actor)
        )
        assert (
            usage.outcome == "SUCCEEDED"
            and usage.input_tokens == 10
            and usage.output_tokens == 2
        )
        assert usage.resource_id == draft_identity(
            actor, first.inputHash, first.catalogHash
        )
