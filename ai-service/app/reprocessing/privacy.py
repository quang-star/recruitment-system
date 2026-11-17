"""Keep only operational history after the corresponding source is erased."""
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.reprocessing.models import ReprocessingAudit, ReprocessingItem, TERMINAL_STATES
from app.reprocessing.repository import batch_record, finish_item


def scrub_source(session: Session, *, cv_version_id: int | None = None, application_id: int | None = None) -> None:
    condition = (ReprocessingItem.cv_version_id == cv_version_id if cv_version_id is not None
                 else ReprocessingItem.application_id == application_id)
    batch_ids = session.scalars(select(ReprocessingItem.batch_id).where(condition).distinct()
                                .order_by(ReprocessingItem.batch_id)).all()
    # Same order as completion/control: batch before item. The caller already
    # holds the CV or Application resource lock.
    batches = {identity: batch_record(session, identity, lock=True) for identity in batch_ids}
    items = session.scalars(select(ReprocessingItem).where(condition).order_by(ReprocessingItem.batch_id, ReprocessingItem.ordinal)
                            .with_for_update()).all()
    now = datetime.now(UTC)
    code = "CV_DELETED" if cv_version_id is not None else "ACCESS_REVOKED"
    for item in items:
        if item.state not in TERMINAL_STATES:
            finish_item(session, batches[item.batch_id], item, "SKIPPED", code, now)
        item.resource_id = item.cv_version_id = item.job_version_id = item.application_id = None
        item.snapshot = None
        item.current_hash = item.effect_key = None
        item.output_id = item.lease_token = item.lease_expires_at = None
        item.reasons, item.safe_error_code, item.updated_at = ["SOURCE_ERASED"], code, now
    if batch_ids:
        # A free-form operator reason can mention a source even though the audit
        # schema contains no entity refs. Preserve action/actor/time, clear text.
        session.execute(update(ReprocessingAudit).where(ReprocessingAudit.batch_id.in_(batch_ids))
                        .values(reason="[Source-related audit text erased]"))
    session.flush()
