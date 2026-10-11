"""Durable admission limits and safe metadata, shared by worker replicas."""
from datetime import UTC, date, datetime
from hashlib import sha256
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, Integer, String, Uuid, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database import Base
from app.shared.extraction_types import ExtractionContext


class ExtractionDailyBudget(Base):
    __tablename__ = "extraction_daily_budgets"
    __table_args__ = (CheckConstraint("call_count >= 0", name="ck_extraction_budget_count"),)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    scope: Mapped[str] = mapped_column(String(50), primary_key=True)
    call_count: Mapped[int] = mapped_column(Integer, nullable=False)


class ExtractionUsage(Base):
    __tablename__ = "extraction_usage"
    __table_args__ = (
        CheckConstraint("input_tokens IS NULL OR input_tokens >= 0", name="ck_extraction_input_tokens"),
        CheckConstraint("output_tokens IS NULL OR output_tokens >= 0", name="ck_extraction_output_tokens"),
    )
    request_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    resource_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    document_kind: Mapped[str] = mapped_column(String(2), nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(40), nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BudgetExceeded(Exception):
    pass


class _DuplicateRequest(Exception):
    pass


class ExtractionUsageRepository:
    def __init__(self, factory, *, daily_limit: int, user_daily_limit: int):
        self.factory = factory
        self.daily_limit = daily_limit
        self.user_daily_limit = user_daily_limit

    def reserve(self, context: ExtractionContext, kind: str, provider: str, model: str,
                *, now: datetime | None = None) -> tuple[str | None, str | None]:
        if not context.permits_external_ai or kind not in {"cv", "jd"}:
            return None, "EXTERNAL_AI_NOT_CONSENTED"
        now = now or datetime.now(UTC)
        key = sha256(f"{kind}:{context.resource_id}:{context.source_hash}:{provider}:{model}".encode()).hexdigest()
        try:
            with self.factory.begin() as session:
                dialect = session.get_bind().dialect.name
                insert = pg_insert if dialect == "postgresql" else sqlite_insert if dialect == "sqlite" else None
                if insert is None:
                    return None, "EXTERNAL_AI_BUDGET_UNAVAILABLE"
                # Updating the global counter serializes admissions across replicas.
                # Rollback restores both counters when an admission is rejected.
                self._increment(session, insert, now.date(), "global", self.daily_limit)
                if session.get(ExtractionUsage, key) is not None:
                    raise _DuplicateRequest()
                self._increment(session, insert, now.date(), str(context.owner_user_id), self.user_daily_limit)
                session.add(ExtractionUsage(
                    request_key=key, owner_user_id=context.owner_user_id, resource_id=context.resource_id,
                    document_kind=kind, provider=provider, model=model,
                    policy_version=context.policy_version, outcome="RESERVED",
                    input_tokens=None, output_tokens=None, created_at=now, updated_at=now,
                ))
            return key, None
        except BudgetExceeded:
            return None, "EXTERNAL_AI_LIMIT_REACHED"
        except _DuplicateRequest:
            return None, "EXTERNAL_AI_ALREADY_REQUESTED"

    @staticmethod
    def _increment(session, insert, day: date, scope: str, limit: int) -> None:
        if limit <= 0:
            raise BudgetExceeded()
        statement = insert(ExtractionDailyBudget).values(day=day, scope=scope, call_count=1)
        statement = statement.on_conflict_do_update(
            index_elements=[ExtractionDailyBudget.day, ExtractionDailyBudget.scope],
            set_={"call_count": ExtractionDailyBudget.call_count + 1},
            where=ExtractionDailyBudget.call_count < limit,
        ).returning(ExtractionDailyBudget.call_count)
        if session.scalar(statement) is None:
            raise BudgetExceeded()

    def finish(self, key: str, outcome: str, usage: dict) -> None:
        if outcome not in {"SUCCEEDED", "FALLBACK"}:
            raise ValueError("Invalid extraction outcome")
        with self.factory.begin() as session:
            session.execute(update(ExtractionUsage).where(ExtractionUsage.request_key == key).values(
                outcome=outcome, input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"), updated_at=datetime.now(UTC),
            ))
