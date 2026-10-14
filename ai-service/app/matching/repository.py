from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, JSON, Numeric, String, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base
from app.matching.algorithm import ALGORITHM_VERSION
from app.taxonomy.normalizer import taxonomy_version


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
    taxonomy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cv_revision_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    jd_revision_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    as_of_month: Mapped[str | None] = mapped_column(String(7), nullable=True)


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
    taxonomy_version: str
    created_at: datetime
    cv_revision_id: UUID | None = None
    jd_revision_id: UUID | None = None
    as_of_month: str | None = None


class MatchingResultRepository:
    def __init__(self, session: Session):
        self._session = session

    def save(self, application_id: UUID, cv_version_id: UUID, job_version_id: UUID,
             status: str, final_score: float, quality_flags: list,
             components: list, claims: list, *, cv_revision_id: UUID | None = None,
             jd_revision_id: UUID | None = None, as_of_month: str | None = None,
             input_taxonomy_version: str | None = None) -> MatchingResult:
        existing_head = self._session.scalar(
            select(MatchingHeadRecord)
            .where(MatchingHeadRecord.application_id == application_id)
            .with_for_update()
        )
        active_taxonomy_version = input_taxonomy_version or taxonomy_version()
        if existing_head is not None:
            existing = self._session.get(MatchingResultRecord, existing_head.result_id)
            if existing is not None and (not _input_unavailable(existing.status, existing.quality_flags)
                                        or _input_unavailable(status, quality_flags)) \
                    and existing.cv_version_id == cv_version_id \
                    and existing.job_version_id == job_version_id \
                    and existing.algorithm_version == ALGORITHM_VERSION \
                    and existing.cv_revision_id == cv_revision_id \
                    and existing.jd_revision_id == jd_revision_id \
                    and existing.taxonomy_version == active_taxonomy_version:
                return self._to_domain(existing)
        now = datetime.now().astimezone()
        record = MatchingResultRecord(
            public_id=uuid4(), application_id=application_id,
            cv_version_id=cv_version_id, job_version_id=job_version_id,
            status=status, final_score=final_score, quality_flags=quality_flags,
            components=components, claims=claims, algorithm_version=ALGORITHM_VERSION,
            taxonomy_version=active_taxonomy_version,
            created_at=now,
            cv_revision_id=cv_revision_id, jd_revision_id=jd_revision_id, as_of_month=as_of_month,
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

    def find_input_unavailable(self, *, cv_version_id: UUID | None = None,
                               job_version_id: UUID | None = None) -> list[MatchingResult]:
        statement = select(MatchingResultRecord).join(
            MatchingHeadRecord, MatchingHeadRecord.result_id == MatchingResultRecord.id
        ).where(MatchingResultRecord.status == "INSUFFICIENT_DATA")
        if cv_version_id is not None:
            statement = statement.where(MatchingResultRecord.cv_version_id == cv_version_id)
        if job_version_id is not None:
            statement = statement.where(MatchingResultRecord.job_version_id == job_version_id)
        rows = self._session.scalars(statement).all()
        return [self._to_domain(row) for row in rows
                if _input_unavailable(row.status, row.quality_flags)]

    @staticmethod
    def _to_domain(record: MatchingResultRecord) -> MatchingResult:
        return MatchingResult(
            public_id=record.public_id, application_id=record.application_id,
            cv_version_id=record.cv_version_id, job_version_id=record.job_version_id,
            status=record.status, final_score=float(record.final_score),
            quality_flags=record.quality_flags, components=record.components,
            claims=record.claims, algorithm_version=record.algorithm_version,
            taxonomy_version=record.taxonomy_version,
            created_at=record.created_at,
            cv_revision_id=record.cv_revision_id, jd_revision_id=record.jd_revision_id,
            as_of_month=record.as_of_month,
        )


def _input_unavailable(status: str, quality_flags: list) -> bool:
    return status == "INSUFFICIENT_DATA" and "INPUT_REVISION_UNAVAILABLE" in quality_flags
