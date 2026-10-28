from __future__ import annotations

from app.shared.database import BUSINESS_ID
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base


class ParsedCvRevisionRecord(Base):
    __tablename__ = "parsed_cv_revisions"

    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True, autoincrement=True)
    cv_version_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PARSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, default=0)
    supersedes_revision_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    reprocess_effect_key: Mapped[str | None] = mapped_column(String(64), unique=True)


class ParsedCvHeadRecord(Base):
    __tablename__ = "parsed_cv_heads"

    cv_version_id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    revision_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    confirmed_by: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, default=0)


@dataclass(frozen=True, slots=True)
class ParsedCvRevision:
    id: int
    cv_version_id: int
    owner_user_id: int
    revision_number: int
    source_hash: str
    payload: dict
    status: str
    confirmed_by: int | None
    confirmed_at: datetime | None
    version: int
    supersedes_revision_id: int | None = None
    reprocess_effect_key: str | None = None


class ParsedCvRevisionRepository:
    def __init__(self, session: Session):
        self._session = session

    def create(self, cv_version_id: int, owner_user_id: int, source_hash: str,
               payload: dict) -> ParsedCvRevision:
        existing = self._session.scalar(
            select(ParsedCvRevisionRecord)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .order_by(ParsedCvRevisionRecord.revision_number.desc())
        )
        if existing is not None:
            return self._to_domain(existing, None)

        next_number = self._session.execute(
            select(func.coalesce(func.max(ParsedCvRevisionRecord.revision_number), 0) + 1)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
        ).scalar_one()
        now = datetime.now().astimezone()
        record = ParsedCvRevisionRecord(

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

    def create_revision(self, cv_version_id: int, owner_user_id: int,
                       source_hash: str, payload: dict,
                       expected_revision_id: int | None = None) -> ParsedCvRevision:
        """Create an immutable candidate-edited revision with optimistic locking."""
        latest = self._session.scalar(
            select(ParsedCvRevisionRecord)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .where(ParsedCvRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedCvRevisionRecord.revision_number.desc())
            .with_for_update()
        )
        if expected_revision_id is not None and (
            latest is None or latest.id != expected_revision_id
        ):
            raise ValueError("ParsedCV revision is stale; reload the latest revision")

        next_number = (latest.revision_number + 1) if latest else 1
        now = datetime.now().astimezone()
        record = ParsedCvRevisionRecord(

            cv_version_id=cv_version_id,
            owner_user_id=owner_user_id,
            revision_number=next_number,
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

    def create_reprocess_revision(self, cv_version_id: int, owner_user_id: int,
                                  source_hash: str, payload: dict, expected_revision_id: int,
                                  effect_key: str) -> ParsedCvRevision:
        existing = self._session.scalar(select(ParsedCvRevisionRecord).where(
            ParsedCvRevisionRecord.reprocess_effect_key == effect_key))
        if existing is not None:
            if existing.cv_version_id != cv_version_id or existing.owner_user_id != owner_user_id:
                raise ValueError("Reprocessing effect belongs to another source")
            return self._to_domain(existing, None)
        revision = self.create_revision(cv_version_id, owner_user_id, source_hash, payload, expected_revision_id)
        record = self._session.scalar(select(ParsedCvRevisionRecord).where(ParsedCvRevisionRecord.id == revision.id))
        if record is None:
            raise RuntimeError("Reprocessing revision was not persisted")
        record.supersedes_revision_id, record.reprocess_effect_key = expected_revision_id, effect_key
        self._session.flush()
        return self._to_domain(record, None)

    def find_owned(self, cv_version_id: int, owner_user_id: int) -> ParsedCvRevision | None:
        row = self._session.execute(
            select(ParsedCvRevisionRecord, ParsedCvHeadRecord)
            .outerjoin(ParsedCvHeadRecord,
                       ParsedCvHeadRecord.revision_id == ParsedCvRevisionRecord.id)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .where(ParsedCvRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedCvRevisionRecord.revision_number.desc())
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def find_confirmed(self, cv_version_id: int) -> ParsedCvRevision | None:
        row = self._session.execute(
            select(ParsedCvRevisionRecord, ParsedCvHeadRecord)
            .join(ParsedCvHeadRecord, ParsedCvHeadRecord.revision_id == ParsedCvRevisionRecord.id)
            .where(ParsedCvHeadRecord.cv_version_id == cv_version_id)
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def confirm(self, cv_version_id: int, owner_user_id: int,
                expected_revision_id: int, confirmed_by: int) -> ParsedCvRevision:
        record = self._session.scalar(
            select(ParsedCvRevisionRecord)
            .where(ParsedCvRevisionRecord.cv_version_id == cv_version_id)
            .where(ParsedCvRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedCvRevisionRecord.revision_number.desc())
            .with_for_update()
        )
        if record is None:
            raise LookupError("ParsedCV revision was not found")
        if record.id != expected_revision_id:
            raise ValueError("ParsedCV revision is stale; reload the latest revision")

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
            id=record.id,
            cv_version_id=record.cv_version_id,
            owner_user_id=record.owner_user_id,
            revision_number=record.revision_number,
            source_hash=record.source_hash,
            payload=record.payload,
            status=record.status,
            confirmed_by=head.confirmed_by if head else None,
            confirmed_at=head.confirmed_at if head else None,
            version=record.version,
            supersedes_revision_id=record.supersedes_revision_id,
            reprocess_effect_key=record.reprocess_effect_key,
        )
