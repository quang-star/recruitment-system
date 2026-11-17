from app.shared.api_ids import BusinessId

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.reprocessing.impact import preview
from app.reprocessing.models import (ControlRequest, CreateBatchRequest, ImpactRequest, ReprocessingAttempt,
                                     ReprocessingAudit, ReprocessingItem)
from app.reprocessing.repository import aware, batch_record, control_batch, create_batch, public_batch
from app.reprocessing.service import ReprocessingService
from app.reprocessing.source_state import HttpSourceStateReader
from app.shared.api import ApiContractError
from app.shared.config import Settings, get_settings
from app.shared.database import _session_factory, get_session
from app.taxonomy.api import require_admin

router = APIRouter(prefix="/api/v2/taxonomy/reprocessing", tags=["reprocessing"])


def get_service(settings: Settings = Depends(get_settings)) -> ReprocessingService:
    reader = HttpSourceStateReader(settings.reprocessing_core_eligibility_url, settings.reprocessing_core_timeout_seconds)
    return ReprocessingService(_session_factory(settings.db_url), settings, reader)


@router.post("/impact")
def impact(body: ImpactRequest, principal=Depends(require_admin), session: Session = Depends(get_session),
           settings: Settings = Depends(get_settings)):
    return preview(session, settings, body)[0]


@router.post("/batches")
def create(body: CreateBatchRequest, request: Request, principal=Depends(require_admin),
           idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
           session: Session = Depends(get_session), settings: Settings = Depends(get_settings)):
    batch = create_batch(session, settings, body, actor=principal.subject, correlation=request.state.correlation_id,
                         idempotency_key=idempotency_key)
    session.commit()
    return public_batch(session, batch)


@router.get("/batches/{batch_id}")
def get_batch(batch_id: BusinessId, page: int = Query(default=0, ge=0, le=100000), size: int = Query(default=20, ge=1, le=100),
              principal=Depends(require_admin), session: Session = Depends(get_session)):
    return public_batch(session, batch_record(session, batch_id), page=page, size=size)


@router.post("/batches/{batch_id}/control")
def control(batch_id: BusinessId, body: ControlRequest, request: Request, principal=Depends(require_admin),
            session: Session = Depends(get_session)):
    batch = control_batch(session, batch_id, body, principal.subject, request.state.correlation_id)
    session.commit()
    return public_batch(session, batch)


@router.post("/batches/{batch_id}/step")
async def step(batch_id: BusinessId, request: Request, principal=Depends(require_admin),
               service: ReprocessingService = Depends(get_service)):
    return await service.step(batch_id, principal.subject, request.state.correlation_id,
                              request.headers.get("Authorization", ""))


@router.get("/batches/{batch_id}/history")
def history(batch_id: BusinessId, page: int = Query(default=0, ge=0, le=100000), size: int = Query(default=20, ge=1, le=100),
            principal=Depends(require_admin), session: Session = Depends(get_session)):
    batch_record(session, batch_id)
    rows = session.scalars(select(ReprocessingAudit).where(ReprocessingAudit.batch_id == batch_id)
                           .order_by(ReprocessingAudit.occurred_at.desc(), ReprocessingAudit.id.desc()).offset(page * size).limit(size)).all()
    return {"page": page, "size": size, "items": [{"action": row.action, "actorId": str(row.actor_id),
            "correlationId": str(row.correlation_id), "reason": row.reason, "occurredAt": aware(row.occurred_at).isoformat()} for row in rows]}


@router.get("/batches/{batch_id}/items/{item_id}/attempts")
def attempts(batch_id: BusinessId, item_id: BusinessId, principal=Depends(require_admin), session: Session = Depends(get_session)):
    item = session.scalar(select(ReprocessingItem).where(ReprocessingItem.id == item_id, ReprocessingItem.batch_id == batch_id))
    if item is None:
        raise ApiContractError(404, "REPROCESS_ITEM_NOT_FOUND", "Reprocessing item was not found")
    rows = session.scalars(select(ReprocessingAttempt).where(ReprocessingAttempt.item_id == item_id)
                           .order_by(ReprocessingAttempt.number).limit(3)).all()
    return [{"attempt": row.number, "actorId": str(row.actor_id), "correlationId": str(row.correlation_id),
             "startedAt": aware(row.started_at).isoformat(), "finishedAt": aware(row.finished_at).isoformat() if row.finished_at else None,
             "outcome": row.outcome, "safeErrorCode": row.safe_error_code} for row in rows]
