from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, Uuid, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base


class ParsedCvRevisionRecord(Base):
    __tablename__ = "parsed_cv_revisions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    public_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    cv_version_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    owner_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PARSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class ParsedCvHeadRecord(Base):
    __tablename__ = "parsed_cv_heads"

    cv_version_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    revision_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    confirmed_by: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


@dataclass(frozen=True, slots=True)
class ParsedCvRevision:
    public_id: UUID
    cv_version_id: UUID
    owner_user_id: UUID
    revision_number: int
    source_hash: str
    payload: dict
    status: str
    confirmed_by: UUID | None
    confirmed_at: datetime | None
    version: int


class ParsedCvRevisionRepository:
    def __init__(self, session: Session):
        self._session = session

    def create(self, cv_version_id: UUID, owner_user_id: UUID, source_hash: str,
               payload: dict) -> ParsedCvRevision:
        existing = self._session.scalar(
            select(ParsedCvRevisionRecord)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .order_by(ParsedCvRevisionRecord.revision_number.desc())
        )
        if existing is not None:
            return self._to_domain(existing, None)

        next_number = self._session.scalar(
            select(func.coalesce(func.max(ParsedCvRevisionRecord.revision_number), 0) + 1)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
        )
        now = datetime.now().astimezone()
        record = ParsedCvRevisionRecord(
            public_id=uuid4(),
            cv_version_id=cv_version_id,
            owner_user_id=owner_user_id,
            revision_number=int(next_number),
            source_hash=source_hash,
            payload=payload,
            status="PARSED",
            created_at=now,
            updated_at=now,
            version=0,
        )
        self._session.add(record)
        self._session.flush()
        return self._to_domain(record, None)

    def find_owned(self, cv_version_id: UUID, owner_user_id: UUID) -> ParsedCvRevision | None:
        row = self._session.execute(
            select(ParsedCvRevisionRecord, ParsedCvHeadRecord)
            .outerjoin(ParsedCvHeadRecord,
                       ParsedCvHeadRecord.revision_id == ParsedCvRevisionRecord.id)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .where(ParsedCvRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedCvRevisionRecord.revision_number.desc())
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def confirm(self, cv_version_id: UUID, owner_user_id: UUID,
                expected_revision_id: UUID, confirmed_by: UUID) -> ParsedCvRevision:
        record = self._session.scalar(
            select(ParsedCvRevisionRecord)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .where(ParsedCvRevisionRecord.owner_user_id == owner_user_id)
            .where(ParsedCvRevisionRecord.public_id == expected_revision_id)
            .with_for_update()
        )
        if record is None:
            raise LookupError("ParsedCV revision was not found")

        head = self._session.scalar(
            select(ParsedCvHeadRecord)
            .where(ParsedCvHeadRecord.cv_version_id == cv_version_id)
            .with_for_update()
        )
        now = datetime.now().astimezone()
        if head is None:
            self._session.add(ParsedCvHeadRecord(
                cv_version_id=cv_version_id,
                revision_id=record.id,
                confirmed_by=confirmed_by,
                confirmed_at=now,
                version=0,
            ))
        elif head.revision_id != record.id:
            self._session.execute(
                update(ParsedCvRevisionRecord)
                .where(ParsedCvRevisionRecord.id == head.revision_id)
                .values(status="SUPERSEDED", updated_at=now,
                        version=ParsedCvRevisionRecord.version + 1)
            )
            head.revision_id = record.id
            head.confirmed_by = confirmed_by
            head.confirmed_at = now
            head.version += 1

        record.status = "CONFIRMED"
        record.updated_at = now
        record.version += 1
        self._session.flush()
        return self._to_domain(record, ParsedCvHeadRecord(
            cv_version_id=cv_version_id,
            revision_id=record.id,
            confirmed_by=confirmed_by,
            confirmed_at=now,
            version=0,
        ) if head is None else head)

    @staticmethod
    def _to_domain(record: ParsedCvRevisionRecord,
                   head: ParsedCvHeadRecord | None) -> ParsedCvRevision:
        return ParsedCvRevision(
            public_id=record.public_id,
            cv_version_id=record.cv_version_id,
            owner_user_id=record.owner_user_id,
            revision_number=record.revision_number,
            source_hash=record.source_hash,
            payload=record.payload,
            status=record.status,
            confirmed_by=head.confirmed_by if head else None,
            confirmed_at=head.confirmed_at if head else None,
            version=record.version,
        )
