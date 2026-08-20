from datetime import UTC, datetime
import json
from typing import Any, Literal
from uuid import UUID, uuid4

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.cv.repository import ParsedCvRevision, ParsedCvRevisionRepository
from app.shared.api import ApiContractError
from app.shared.config import get_settings
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token

router = APIRouter(
    prefix="/api/v1/parsed-cvs",
    tags=["parsed-cvs"],
    dependencies=[Depends(require_access_token)],
)


class ParsedCvResponse(BaseModel):
    revisionId: UUID
    cvVersionId: UUID
    revisionNumber: int
    sourceHash: str
    status: Literal["PARSED", "CONFIRMED", "SUPERSEDED"]
    payload: dict[str, Any]
    confirmedBy: UUID | None
    confirmedAt: datetime | None
    version: int

    @classmethod
    def from_revision(cls, revision: ParsedCvRevision) -> "ParsedCvResponse":
        return cls(
            revisionId=revision.public_id,
            cvVersionId=revision.cv_version_id,
            revisionNumber=revision.revision_number,
            sourceHash=revision.source_hash,
            status=revision.status,
            payload=revision.payload,
            confirmedBy=revision.confirmed_by,
            confirmedAt=revision.confirmed_at,
            version=revision.version,
        )


class ConfirmParsedCvRequest(BaseModel):
    expectedRevisionId: UUID = Field(description="Revision shown to the candidate before confirmation")


@router.get("/{cv_version_id}", response_model=ParsedCvResponse)
def get_parsed_cv(cv_version_id: UUID, principal: AuthenticatedPrincipal = Depends(require_access_token),
                  session: Session = Depends(get_session)) -> ParsedCvResponse:
    revision = ParsedCvRevisionRepository(session).find_owned(cv_version_id, principal.subject)
    if revision is None:
        raise ApiContractError(404, "PARSED_CV_NOT_FOUND", "Parsed CV was not found")
    return ParsedCvResponse.from_revision(revision)


@router.post("/{cv_version_id}/confirm", response_model=ParsedCvResponse)
async def confirm_parsed_cv(
    cv_version_id: UUID,
    request_body: ConfirmParsedCvRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_access_token),
    session: Session = Depends(get_session),
) -> ParsedCvResponse:
    repository = ParsedCvRevisionRepository(session)
    try:
        revision = repository.confirm(
            cv_version_id=cv_version_id,
            owner_user_id=principal.subject,
            expected_revision_id=request_body.expectedRevisionId,
            confirmed_by=principal.subject,
        )
    except LookupError as exception:
        raise ApiContractError(404, "PARSED_CV_REVISION_NOT_FOUND", str(exception)) from exception

    session.commit()
    settings = get_settings()
    event = {
        "eventId": str(uuid4()),
        "eventType": "cv.confirmed.v1",
        "schemaVersion": 1,
        "correlationId": str(request.state.correlation_id),
        "idempotencyKey": f"cv.confirmed.v1:{cv_version_id}:{revision.public_id}",
        "occurredAt": datetime.now(UTC).isoformat(),
        "payload": {
            "cvVersionId": str(cv_version_id),
            "parsedRevisionId": str(revision.public_id),
            "sourceHash": revision.source_hash,
            "confirmedBy": str(principal.subject),
        },
    }
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda value: json.dumps(value, separators=(",", ":")).encode("utf-8"),
    )
    try:
        await producer.start()
        await producer.send_and_wait(
            settings.kafka_cv_confirmed_topic,
            key=str(cv_version_id).encode("utf-8"),
            value=event,
        )
    except Exception as exception:
        raise ApiContractError(
            503,
            "CV_CONFIRMATION_EVENT_UNAVAILABLE",
            "CV confirmation is saved but status propagation is temporarily unavailable",
        ) from exception
    finally:
        await producer.stop()
    return ParsedCvResponse.from_revision(revision)
