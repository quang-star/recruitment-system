from __future__ import annotations

from app.shared.database import BUSINESS_ID
from dataclasses import dataclass
from copy import deepcopy
from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, func, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base


class ParsedJdRevisionRecord(Base):
    __tablename__ = "parsed_jd_revisions"

    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    job_version_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PARSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_by: Mapped[int | None] = mapped_column(BUSINESS_ID)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, default=0)
    supersedes_revision_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    reprocess_effect_key: Mapped[str | None] = mapped_column(String(64), unique=True)


class ParsedJdHeadRecord(Base):
    __tablename__ = "parsed_jd_heads"

    job_version_id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    revision_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    confirmed_by: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, default=0)


@dataclass(frozen=True, slots=True)
class ParsedJdRevision:
    id: int
    job_id: int
    job_version_id: int
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


class ParsedJdRevisionRepository:
    def __init__(self, session: Session):
        self._session = session

    def upsert(self, job_id: int, job_version_id: int, owner_user_id: int,
               source_hash: str, payload: dict) -> ParsedJdRevision:
        latest = self._session.scalar(
            select(ParsedJdRevisionRecord)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
        )
        if latest is not None and latest.source_hash == source_hash:
            return self._to_domain(latest, None)

        next_number = self._session.execute(
            select(func.coalesce(func.max(ParsedJdRevisionRecord.revision_number), 0) + 1)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
        ).scalar_one()
        now = datetime.now().astimezone()
        record = ParsedJdRevisionRecord(
            job_id=job_id, job_version_id=job_version_id,
            owner_user_id=owner_user_id, revision_number=int(next_number),
            source_hash=source_hash, payload=payload, status="PARSED",
            created_at=now, updated_at=now, version=0,
        )
        self._session.add(record)
        self._session.flush()
        return self._to_domain(record, None)

    def create_revision(self, job_id: int, job_version_id: int, owner_user_id: int,
                        source_hash: str, payload: dict,
                        expected_revision_id: int) -> ParsedJdRevision:
        latest = self._session.scalar(
            select(ParsedJdRevisionRecord)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .where(ParsedJdRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
            .with_for_update()
        )
        if latest is None or latest.id != expected_revision_id:
            raise ValueError("ParsedJD revision is stale; reload the latest revision")
        now = datetime.now().astimezone()
        record = ParsedJdRevisionRecord(
            job_id=job_id, job_version_id=job_version_id,
            owner_user_id=owner_user_id, revision_number=latest.revision_number + 1,
            source_hash=source_hash, payload=payload, status="PARSED",
            created_at=now, updated_at=now, version=0,
        )
        self._session.add(record)
        self._session.flush()
        return self._to_domain(record, None)

    def create_reprocess_revision(self, job_id: int, job_version_id: int, owner_user_id: int,
                                  source_hash: str, payload: dict, expected_revision_id: int,
                                  effect_key: str) -> ParsedJdRevision:
        existing = self._session.scalar(select(ParsedJdRevisionRecord).where(
            ParsedJdRevisionRecord.reprocess_effect_key == effect_key))
        if existing is not None:
            if existing.job_version_id != job_version_id or existing.owner_user_id != owner_user_id:
                raise ValueError("Reprocessing effect belongs to another source")
            return self._to_domain(existing, None)
        revision = self.create_revision(job_id, job_version_id, owner_user_id, source_hash, payload, expected_revision_id)
        record = self._session.scalar(select(ParsedJdRevisionRecord).where(ParsedJdRevisionRecord.id == revision.id))
        if record is None:
            raise RuntimeError("Reprocessing revision was not persisted")
        record.supersedes_revision_id, record.reprocess_effect_key = expected_revision_id, effect_key
        self._session.flush()
        return self._to_domain(record, None)

    def find_owned(self, job_version_id: int, owner_user_id: int) -> ParsedJdRevision | None:
        row = self._session.execute(
            select(ParsedJdRevisionRecord, ParsedJdHeadRecord)
            .outerjoin(ParsedJdHeadRecord,
                       ParsedJdHeadRecord.revision_id == ParsedJdRevisionRecord.id)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .where(ParsedJdRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def find_confirmed(self, job_version_id: int) -> ParsedJdRevision | None:
        row = self._session.execute(
            select(ParsedJdRevisionRecord, ParsedJdHeadRecord)
            .join(ParsedJdHeadRecord, ParsedJdHeadRecord.revision_id == ParsedJdRevisionRecord.id)
            .where(ParsedJdHeadRecord.job_version_id == job_version_id)
        ).first()
        return self._to_domain(row[0], row[1]) if row else None

    def confirm(self, job_version_id: int, owner_user_id: int,
                expected_revision_id: int, confirmed_by: int) -> ParsedJdRevision:
        record = self._session.scalar(
            select(ParsedJdRevisionRecord)
            .where(ParsedJdRevisionRecord.job_version_id == job_version_id)
            .where(ParsedJdRevisionRecord.owner_user_id == owner_user_id)
            .order_by(ParsedJdRevisionRecord.revision_number.desc())
            .with_for_update()
        )
        if record is None:
            raise LookupError("ParsedJD revision was not found")
        if record.id != expected_revision_id:
            raise ValueError("ParsedJD revision is stale; reload the latest revision")

        if record.status != "CONFIRMED":
            confirmed_payload = deepcopy(record.payload)
            for section in ("requiredSkills", "preferredSkills"):
                for skill in confirmed_payload.get("requirements", {}).get(section, []):
                    skill["confirmedByRecruiter"] = True
            record.payload = confirmed_payload

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
            id=record.id, job_id=record.job_id,
            job_version_id=record.job_version_id, owner_user_id=record.owner_user_id,
            revision_number=record.revision_number, source_hash=record.source_hash,
            payload=record.payload, status=record.status,
            confirmed_by=(head.confirmed_by if head else record.confirmed_by),
            confirmed_at=(head.confirmed_at if head else record.confirmed_at),
            version=record.version,
            supersedes_revision_id=record.supersedes_revision_id,
            reprocess_effect_key=record.reprocess_effect_key,
        )
