from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, Uuid, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base


class ParsedJdRevisionRecord(Base):
    __tablename__ = "parsed_jd_revisions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    public_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    job_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    job_version_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    owner_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PARSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_by: Mapped[UUID | None] = mapped_column(Uuid)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class ParsedJdHeadRecord(Base):
    __tablename__ = "parsed_jd_heads"

    job_version_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    revision_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    confirmed_by: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


@dataclass(frozen=True, slots=True)
class ParsedJdRevision:
    public_id: UUID
    job_id: UUID
    job_version_id: UUID
    owner_user_id: UUID
    revision_number: int
    source_hash: str
    payload: dict
    status: str
    confirmed_by: UUID | None
    confirmed_at: datetime | None
    version: int


class ParsedJdRevisionRepository:
    def __init__(self, session: Session):
        self._session = session

    def upsert(self, job_id: UUID, job_version_id: UUID, owner_user_id: UUID,
               source_hash: str, payload: dict) -> ParsedJdRevision:
        latest = self._session.scalar(
            select(ParsedJdRevisionRecord)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
        )
        if latest is not None and latest.source_hash == source_hash:
            return self._to_domain(latest, None)

        next_number = self._session.scalar(
            select(func.coalesce(func.max(ParsedJdRevisionRecord.revision_number), 0) + 1)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
        )
        now = datetime.now().astimezone()
        record = ParsedJdRevisionRecord(
            public_id=uuid4(), job_id=job_id, job_version_id=job_version_id,
            owner_user_id=owner_user_id, revision_number=int(next_number),
            source_hash=source_hash, payload=payload, status="PARSED",
            created_at=now, updated_at=now, version=0,
        )
        self._session.add(record)
        self._session.flush()
        return self._to_domain(record, None)

    def create_revision(self, job_id: UUID, job_version_id: UUID, owner_user_id: UUID,
                        source_hash: str, payload: dict,
                        expected_revision_id: UUID) -> ParsedJdRevision:
        latest = self._session.scalar(
            select(ParsedJdRevisionRecord)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .where(ParsedJdRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
            .with_for_update()
        )
        if latest is None or latest.public_id != expected_revision_id:
            raise ValueError("ParsedJD revision is stale; reload the latest revision")
        now = datetime.now().astimezone()
        record = ParsedJdRevisionRecord(
            public_id=uuid4(), job_id=job_id, job_version_id=job_version_id,
            owner_user_id=owner_user_id, revision_number=latest.revision_number + 1,
            source_hash=source_hash, payload=payload, status="PARSED",
            created_at=now, updated_at=now, version=0,
        )
        self._session.add(record)
        self._session.flush()
        return self._to_domain(record, None)

    def find_owned(self, job_version_id: UUID, owner_user_id: UUID) -> ParsedJdRevision | None:
        row = self._session.execute(
            select(ParsedJdRevisionRecord, ParsedJdHeadRecord)
            .outerjoin(ParsedJdHeadRecord,
                       ParsedJdHeadRecord.revision_id == ParsedJdRevisionRecord.id)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .where(ParsedJdRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def find_confirmed(self, job_version_id: UUID) -> ParsedJdRevision | None:
        row = self._session.execute(
            select(ParsedJdRevisionRecord, ParsedJdHeadRecord)
            .join(ParsedJdHeadRecord, ParsedJdHeadRecord.revision_id == ParsedJdRevisionRecord.id)
            .where(ParsedJdHeadRecord.job_version_id == job_version_id)
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def confirm(self, job_version_id: UUID, owner_user_id: UUID,
                expected_revision_id: UUID, confirmed_by: UUID) -> ParsedJdRevision:
        record = self._session.scalar(
            select(ParsedJdRevisionRecord)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .where(ParsedJdRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
            .with_for_update()
        )
        if record is None:
            raise LookupError("ParsedJD revision was not found")
        if record.public_id != expected_revision_id:
            raise ValueError("ParsedJD revision is stale; reload the latest revision")

        head = self._session.scalar(
            select(ParsedJdHeadRecord)
            .where(ParsedJdHeadRecord.job_version_id == job_version_id)
            .with_for_update()
        )
        now = datetime.now().astimezone()
        if head is not None and head.revision_id != record.id:
            self._session.execute(
                update(ParsedJdRevisionRecord)
                .where(ParsedJdRevisionRecord.id == head.revision_id)
                .values(status="SUPERSEDED", updated_at=now,
                        version=ParsedJdRevisionRecord.version + 1)
            )
            head.revision_id = record.id
            head.confirmed_by = confirmed_by
            head.confirmed_at = now
            head.version += 1
        elif head is None:
            head = ParsedJdHeadRecord(job_version_id=job_version_id, revision_id=record.id,
                                      confirmed_by=confirmed_by, confirmed_at=now, version=0)
            self._session.add(head)
        record.status = "CONFIRMED"
        record.confirmed_by = confirmed_by
        record.confirmed_at = now
        record.updated_at = now
        record.version += 1
        self._session.flush()
        return self._to_domain(record, head)

    @staticmethod
    def _to_domain(record: ParsedJdRevisionRecord,
                   head: ParsedJdHeadRecord | None) -> ParsedJdRevision:
        return ParsedJdRevision(
            public_id=record.public_id, job_id=record.job_id,
            job_version_id=record.job_version_id, owner_user_id=record.owner_user_id,
            revision_number=record.revision_number, source_hash=record.source_hash,
            payload=record.payload, status=record.status,
            confirmed_by=(head.confirmed_by if head else record.confirmed_by),
            confirmed_at=(head.confirmed_at if head else record.confirmed_at),
            version=record.version,
        )
