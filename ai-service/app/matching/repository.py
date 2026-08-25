from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, JSON, Numeric, String, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base


class MatchingResultRecord(Base):
    __tablename__ = "matching_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    public_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    application_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    cv_version_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    job_version_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    final_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    quality_flags: Mapped[list] = mapped_column(JSON, nullable=False)
    components: Mapped[list] = mapped_column(JSON, nullable=False)
    claims: Mapped[list] = mapped_column(JSON, nullable=False)
    algorithm_version: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MatchingHeadRecord(Base):
    __tablename__ = "matching_heads"

    application_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    result_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


@dataclass(frozen=True, slots=True)
class MatchingResult:
    public_id: UUID
    application_id: UUID
    cv_version_id: UUID
    job_version_id: UUID
    status: str
    final_score: float
    quality_flags: list
    components: list
    claims: list
    algorithm_version: str
    created_at: datetime


class MatchingResultRepository:
    def __init__(self, session: Session):
        self._session = session

    def save(self, application_id: UUID, cv_version_id: UUID, job_version_id: UUID,
             status: str, final_score: float, quality_flags: list,
             components: list, claims: list) -> MatchingResult:
        existing_head = self._session.scalar(
            select(MatchingHeadRecord).where(MatchingHeadRecord.application_id == application_id)
        )
        if existing_head is not None:
            existing = self._session.get(MatchingResultRecord, existing_head.result_id)
            if existing is not None and existing.cv_version_id == cv_version_id \
                    and existing.job_version_id == job_version_id:
                return self._to_domain(existing)
        now = datetime.now().astimezone()
        record = MatchingResultRecord(
            public_id=uuid4(), application_id=application_id,
            cv_version_id=cv_version_id, job_version_id=job_version_id,
            status=status, final_score=final_score, quality_flags=quality_flags,
            components=components, claims=claims, algorithm_version="baseline-v1",
            created_at=now,
        )
        self._session.add(record)
        self._session.flush()
        if existing_head is None:
            self._session.add(MatchingHeadRecord(application_id=application_id,
                                                 result_id=record.id, updated_at=now))
        else:
            existing_head.result_id = record.id
            existing_head.updated_at = now
        self._session.flush()
        return self._to_domain(record)

    def find_latest(self, application_id: UUID) -> MatchingResult | None:
        row = self._session.execute(
            select(MatchingResultRecord).join(
                MatchingHeadRecord, MatchingHeadRecord.result_id == MatchingResultRecord.id
            ).where(MatchingHeadRecord.application_id == application_id)
        ).scalar_one_or_none()
        return self._to_domain(row) if row else None

    @staticmethod
    def _to_domain(record: MatchingResultRecord) -> MatchingResult:
        return MatchingResult(
            public_id=record.public_id, application_id=record.application_id,
            cv_version_id=record.cv_version_id, job_version_id=record.job_version_id,
            status=record.status, final_score=float(record.final_score),
            quality_flags=record.quality_flags, components=record.components,
            claims=record.claims, algorithm_version=record.algorithm_version,
            created_at=record.created_at,
        )
