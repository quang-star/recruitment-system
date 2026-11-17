from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5
from pydantic import TypeAdapter

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.reprocessing.impact import digest, preview
from app.reprocessing.models import (ControlRequest, CreateBatchRequest, ReprocessingAttempt, ReprocessingAudit,
                                     ReprocessingBatch, ReprocessingItem, TERMINAL_STATES)
from app.reprocessing.models import Operation
from app.shared.api import ApiContractError
from app.shared.config import Settings
from app.shared.privacy import lock_resource

MAX_ATTEMPTS = 3


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def batch_record(session: Session, identity: int, *, lock: bool = False) -> ReprocessingBatch:
    query = select(ReprocessingBatch).where(ReprocessingBatch.id == identity)
    if lock:
        query = query.with_for_update()
    batch = session.scalar(query.execution_options(populate_existing=True))
    if batch is None:
        raise ApiContractError(404, "REPROCESS_BATCH_NOT_FOUND", "Reprocessing batch was not found")
    return batch


def audit(session: Session, batch: ReprocessingBatch, actor: int, correlation: UUID, action: str, reason: str) -> None:
    session.add(ReprocessingAudit(batch_id=batch.id, actor_id=actor, correlation_id=correlation,
                                action=action, reason=reason, occurred_at=datetime.now(UTC)))


def create_batch(session: Session, settings: Settings, body: CreateBatchRequest, *, actor: int,
                 correlation: UUID, idempotency_key: str) -> ReprocessingBatch:
    if not idempotency_key.strip() or len(idempotency_key) > 200:
        raise ApiContractError(422, "REPROCESS_IDEMPOTENCY_KEY_REQUIRED", "Use an idempotency key of 1–200 characters")
    key_hash = hashlib.sha256(f"reprocess-create-v1:{body.operation}:{idempotency_key}".encode()).hexdigest()
    request_hash = digest(body.model_dump(mode="json"))
    lock_resource(session, "REPROCESS_COMMAND", uuid5(NAMESPACE_URL, f"{actor}:{key_hash}"))
    old = session.scalar(select(ReprocessingBatch).where(ReprocessingBatch.actor_id == actor,
                                                       ReprocessingBatch.idempotency_key_hash == key_hash))
    if old is not None:
        if old.request_hash != request_hash:
            raise ApiContractError(409, "REPROCESS_IDEMPOTENCY_CONFLICT", "The idempotency key belongs to another request")
        return old
    payload, items = preview(session, settings, body)
    if payload["previewHash"] != body.previewHash:
        raise ApiContractError(409, "REPROCESS_PREVIEW_STALE", "Impact changed; preview again before creating the batch")
    now = datetime.now(UTC)
    skipped = sum(not item.ready for item in items)
    batch = ReprocessingBatch(actor_id=actor, idempotency_key_hash=key_hash, request_hash=request_hash,
        operation=body.operation, target_config=payload["target"], target_hash=payload["targetHash"],
        state="COMPLETED" if skipped == len(items) else "RUNNING", version=0, checkpoint=skipped,
        planned_count=len(items), created_at=now, updated_at=now)
    session.add(batch)
    session.flush()
    for index, item in enumerate(items):
        session.add(ReprocessingItem(batch_id=batch.id, ordinal=index, resource_id=item.resource_id,
            cv_version_id=item.cv_version_id, job_version_id=item.job_version_id, application_id=item.application_id,
            snapshot=item.snapshot, current_hash=item.current_hash,
            effect_key=digest({"operation": item.operation, "resource": str(item.resource_id),
                               "currentHash": item.current_hash, "targetHash": batch.target_hash}),
            reasons=item.reasons, state="PENDING" if item.ready else "SKIPPED", attempt_count=0,
            available_at=now, safe_error_code=None if item.ready else item.reasons[-1], updated_at=now))
    audit(session, batch, actor, correlation, "CREATE", body.reason)
    session.flush()
    return batch


def control_batch(session: Session, identity: int, body: ControlRequest, actor: int, correlation: UUID) -> ReprocessingBatch:
    batch = batch_record(session, identity, lock=True)
    if batch.version != body.version:
        raise ApiContractError(409, "REPROCESS_BATCH_STALE", "Reload the current batch version")
    expected = "RUNNING" if body.action == "PAUSE" else "PAUSED"
    if batch.state != expected:
        raise ApiContractError(409, "REPROCESS_BATCH_STATE_INVALID", "The action is unavailable in this batch state")
    batch.state = "PAUSED" if body.action == "PAUSE" else "RUNNING"
    batch.version += 1
    batch.updated_at = datetime.now(UTC)
    audit(session, batch, actor, correlation, body.action, body.reason)
    refresh_completion(session, batch)
    session.flush()
    return batch


def refresh_completion(session: Session, batch: ReprocessingBatch) -> None:
    unfinished = session.scalar(select(func.count()).select_from(ReprocessingItem).where(
        ReprocessingItem.batch_id == batch.id, ReprocessingItem.state.not_in(TERMINAL_STATES)))
    if not unfinished and batch.state == "RUNNING":
        batch.state = "COMPLETED"
    batch.updated_at = datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class Claim:
    batch_id: int
    item_id: int
    token: UUID
    attempt: int
    operation: Operation
    target: dict
    target_hash: str
    resource_id: int
    snapshot: dict
    current_hash: str
    effect_key: str


def claim_one(session: Session, batch_id: int, *, actor: int, correlation: UUID,
              lease_seconds: float, now: datetime | None = None) -> Claim | None:
    batch = batch_record(session, batch_id, lock=True)
    if batch.state != "RUNNING":
        return None
    now = now or datetime.now(UTC)
    item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.batch_id == batch_id, or_(
        ReprocessingItem.state.in_(("PENDING", "RETRYING")) & (ReprocessingItem.available_at <= now),
        (ReprocessingItem.state == "PROCESSING") & (ReprocessingItem.lease_expires_at <= now),
    )).order_by(ReprocessingItem.ordinal).with_for_update(skip_locked=True).limit(1))
    if item is None:
        refresh_completion(session, batch)
        return None
    if item.state == "PROCESSING":
        close_attempt(session, item, "LEASE_EXPIRED", "REPROCESS_LEASE_EXPIRED", now)
    if item.attempt_count >= MAX_ATTEMPTS:
        finish_item(session, batch, item, "FAILED", "REPROCESS_RETRY_EXHAUSTED", now)
        return None
    if not item.resource_id or not item.snapshot or not item.current_hash or not item.effect_key:
        finish_item(session, batch, item, "SKIPPED", "SOURCE_NOT_AVAILABLE", now)
        return None
    item.attempt_count += 1
    item.state, item.safe_error_code = "PROCESSING", None
    item.lease_token, item.lease_expires_at = uuid4(), now + timedelta(seconds=lease_seconds)
    item.updated_at = now
    session.add(ReprocessingAttempt(item_id=item.id, number=item.attempt_count, actor_id=actor,
                                   correlation_id=correlation, started_at=now))
    session.flush()
    return Claim(batch.id, item.id, item.lease_token, item.attempt_count, TypeAdapter(Operation).validate_python(batch.operation), batch.target_config,
                 batch.target_hash, item.resource_id, item.snapshot, item.current_hash, item.effect_key)


def valid_claim(session: Session, claim: Claim, *, now: datetime | None = None) -> tuple[ReprocessingBatch, ReprocessingItem] | None:
    # Completion takes source locks first; claims/control never take source locks.
    batch = batch_record(session, claim.batch_id, lock=True)
    item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.id == claim.item_id)
                          .with_for_update().execution_options(populate_existing=True))
    now = now or datetime.now(UTC)
    if (item is None or item.state != "PROCESSING" or item.lease_token != claim.token
            or item.attempt_count != claim.attempt or item.lease_expires_at is None
            or aware(item.lease_expires_at) <= aware(now)):
        return None
    return batch, item


def close_attempt(session: Session, item: ReprocessingItem, outcome: str, code: str | None, now: datetime) -> None:
    attempt = session.scalar(select(ReprocessingAttempt).where(
        ReprocessingAttempt.item_id == item.id, ReprocessingAttempt.number == item.attempt_count))
    if attempt is not None and attempt.finished_at is None:
        attempt.finished_at, attempt.outcome, attempt.safe_error_code = now, outcome, code


def finish_item(session: Session, batch: ReprocessingBatch, item: ReprocessingItem,
                state: str, code: str | None, now: datetime, output_id: int | None = None) -> None:
    was_terminal = item.state in TERMINAL_STATES
    item.state, item.safe_error_code, item.output_id = state, code, output_id
    item.lease_token, item.lease_expires_at, item.updated_at = None, None, now
    if state in TERMINAL_STATES and not was_terminal:
        batch.checkpoint += 1
    close_attempt(session, item, state, code, now)
    session.flush()
    refresh_completion(session, batch)


def fail_claim(session: Session, claim: Claim, code: str, *, retryable: bool) -> bool:
    live = valid_claim(session, claim)
    if live is None:
        return False
    batch, item = live
    now = datetime.now(UTC)
    state = "RETRYING" if retryable and item.attempt_count < MAX_ATTEMPTS else "FAILED"
    finish_item(session, batch, item, state, code, now)
    if state == "RETRYING":
        item.available_at = now + timedelta(seconds=min(300, 2 ** item.attempt_count))
    return True


def public_batch(session: Session, batch: ReprocessingBatch, *, page: int = 0, size: int = 20) -> dict:
    counts: dict[str, int] = {state: count for state, count in session.execute(
        select(ReprocessingItem.state, func.count()).where(ReprocessingItem.batch_id == batch.id)
        .group_by(ReprocessingItem.state)).all()}
    rows = session.scalars(select(ReprocessingItem).where(ReprocessingItem.batch_id == batch.id)
                           .order_by(ReprocessingItem.ordinal).offset(page * size).limit(size)).all()
    safe_fields = ("revisionId", "confirmedRevisionId", "schemaVersion", "taxonomyVersion", "parserVersion",
                   "priorResultId", "algorithmVersion", "asOfMonth", "priorCvRevisionId", "priorJdRevisionId", "modelId", "modelRevision")
    return {"batchId": str(batch.id), "operation": batch.operation, "state": batch.state, "version": batch.version,
            "checkpoint": batch.checkpoint, "plannedCount": batch.planned_count, "counts": counts,
            "target": batch.target_config, "targetHash": batch.target_hash,
            "createdAt": aware(batch.created_at).isoformat(), "updatedAt": aware(batch.updated_at).isoformat(),
            "page": page, "size": size, "total": batch.planned_count, "items": [{
                "itemId": str(item.id), "resourceId": str(item.resource_id) if item.resource_id else None,
                "state": item.state, "attempt": item.attempt_count, "reasons": item.reasons,
                "before": {key: value for key, value in (item.snapshot or {}).items() if key in safe_fields},
                "outputId": str(item.output_id) if item.output_id else None,
                "reviewRequired": item.state == "COMPLETED" and item.output_id is not None and batch.operation != "MATCH_APPLICATION",
                "safeErrorCode": item.safe_error_code,
            } for item in rows]}
