"""AI-owned erasure. Resource locks prevent late writes from restoring erased content."""
from datetime import UTC, datetime
import hashlib
from uuid import UUID
from sqlalchemy import String, Uuid, DateTime, delete, select, text, update
from sqlalchemy.orm import Mapped, Session, mapped_column
from app.shared.database import Base
from app.shared.api import ApiContractError


class PrivacyTombstone(Base):
    __tablename__ = "privacy_tombstones"
    kind: Mapped[str] = mapped_column(String(20), primary_key=True)
    resource_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def lock_resource(session: Session, kind: str, resource_id: UUID) -> None:
    if session.get_bind().dialect.name == "postgresql":
        key = int.from_bytes(hashlib.blake2b(f"{kind}:{resource_id}".encode(), digest_size=8).digest(), "big", signed=True)
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


def erased(session: Session, kind: str, resource_id: UUID) -> bool:
    return session.get(PrivacyTombstone, (kind, resource_id)) is not None


def require_live_cv(session: Session, version_id: UUID) -> None:
    lock_resource(session, "CV", version_id)
    if erased(session, "CV", version_id):
        raise ApiContractError(410, "CV_DELETED", "CV has been deleted")


def _tombstone(session: Session, kind: str, resource_id: UUID) -> None:
    if not erased(session, kind, resource_id):
        session.add(PrivacyTombstone(kind=kind, resource_id=resource_id, created_at=datetime.now(UTC)))
        session.flush()


def erase_application(session: Session, application_id: UUID) -> None:
    from app.matching.repository import MatchingHeadRecord, MatchingResultRecord
    from app.outbox import OutboxEvent
    lock_resource(session, "APPLICATION", application_id)
    _tombstone(session, "APPLICATION", application_id)
    session.execute(delete(MatchingHeadRecord).where(MatchingHeadRecord.application_id == application_id))
    session.execute(delete(MatchingResultRecord).where(MatchingResultRecord.application_id == application_id))
    # Clear both unpublished and delivered payload copies, including evidence/claims.
    session.execute(delete(OutboxEvent).where(OutboxEvent.message_key == str(application_id)))


def process_privacy_event(envelope: dict, factory) -> None:
    from app.cv.repository import ParsedCvHeadRecord, ParsedCvRevisionRecord
    from app.matching.repository import MatchingResultRecord
    from app.task.persistence import ProcessingTaskRecord
    from app.shared.extraction_usage import ExtractionUsage
    from app.outbox import OutboxEvent
    with factory() as session:
        payload = envelope["payload"]
        if envelope["eventType"] == "application.cv-access.revoked.v1":
            erase_application(session, UUID(payload["applicationId"]))
        else:
            version_id = UUID(payload["cvVersionId"])
            lock_resource(session, "CV", version_id)
            _tombstone(session, "CV", version_id)
            apps = session.scalars(select(MatchingResultRecord.application_id)
                                   .where(MatchingResultRecord.cv_version_id == version_id).distinct()).all()
            for application_id in sorted(apps, key=str):
                erase_application(session, application_id)
            session.execute(delete(ParsedCvHeadRecord).where(ParsedCvHeadRecord.cv_version_id == version_id))
            session.execute(delete(ParsedCvRevisionRecord).where(ParsedCvRevisionRecord.cv_version_id == version_id))
            session.execute(update(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == version_id)
                            .values(state="FAILED", safe_error_code="CV_DELETED", result_payload=None,
                                    object_ref=None, source_hash=None, owner_user_id=None, updated_at=datetime.now(UTC)))
            session.execute(delete(ExtractionUsage).where(ExtractionUsage.resource_id == version_id))
            session.execute(delete(OutboxEvent).where(OutboxEvent.message_key.in_([
                str(version_id), str(payload["cvId"])])))
        session.commit()
