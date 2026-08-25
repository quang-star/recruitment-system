from datetime import UTC, datetime
import json
from typing import Any, Literal
from uuid import UUID, uuid4, uuid5

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.jd.parser import parse_jd
from app.jd.repository import ParsedJdRevision, ParsedJdRevisionRepository
from app.shared.api import ApiContractError
from app.shared.config import get_settings
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token

router = APIRouter(
    prefix="/api/v1/parsed-jds",
    tags=["parsed-jds"],
    dependencies=[Depends(require_access_token)],
)


def require_recruiter(principal: AuthenticatedPrincipal = Depends(require_access_token)) -> AuthenticatedPrincipal:
    if "RECRUITER" not in principal.roles:
        raise ApiContractError(403, "RECRUITER_ROLE_REQUIRED", "Recruiter role is required")
    return principal


class UpsertParsedJdRequest(BaseModel):
    jobId: UUID
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(min_length=1, max_length=100_000)
    requirementsText: str = Field(min_length=1, max_length=100_000)
    sourceHash: str = Field(pattern=r"^[0-9a-f]{64}$")


class ConfirmParsedJdRequest(BaseModel):
    expectedRevisionId: UUID = Field(description="Revision shown to the recruiter before confirmation")


class ParsedJdResponse(BaseModel):
    revisionId: UUID
    jobId: UUID
    jobVersionId: UUID
    revisionNumber: int
    sourceHash: str
    status: Literal["PARSED", "CONFIRMED", "SUPERSEDED"]
    payload: dict[str, Any]
    confirmedBy: UUID | None
    confirmedAt: datetime | None
    version: int

    @classmethod
    def from_revision(cls, revision: ParsedJdRevision) -> "ParsedJdResponse":
        return cls(
            revisionId=revision.public_id, jobId=revision.job_id,
            jobVersionId=revision.job_version_id, revisionNumber=revision.revision_number,
            sourceHash=revision.source_hash, status=revision.status, payload=revision.payload,
            confirmedBy=revision.confirmed_by, confirmedAt=revision.confirmed_at,
            version=revision.version,
        )


@router.get("/{job_version_id}", response_model=ParsedJdResponse)
def get_parsed_jd(job_version_id: UUID,
                  principal: AuthenticatedPrincipal = Depends(require_recruiter),
                  session: Session = Depends(get_session)) -> ParsedJdResponse:
    revision = ParsedJdRevisionRepository(session).find_owned(job_version_id, principal.subject)
    if revision is None:
        raise ApiContractError(404, "PARSED_JD_NOT_FOUND", "Parsed JD was not found")
    return ParsedJdResponse.from_revision(revision)


@router.put("/{job_version_id}", response_model=ParsedJdResponse)
async def upsert_parsed_jd(
    job_version_id: UUID,
    request_body: UpsertParsedJdRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_recruiter),
    session: Session = Depends(get_session),
) -> ParsedJdResponse:
    payload = parse_jd(
        str(job_version_id), request_body.sourceHash, request_body.title,
        request_body.description, request_body.requirementsText,
    )
    repository = ParsedJdRevisionRepository(session)
    revision = repository.upsert(
        job_id=request_body.jobId, job_version_id=job_version_id,
        owner_user_id=principal.subject, source_hash=request_body.sourceHash,
        payload=payload,
    )
    session.commit()
    settings = get_settings()
    task_id = uuid5(UUID("b73b8a62-d9ba-4d26-9a7e-96f1c84c3e75"), str(job_version_id))
    event = _event(
        event_type="job.processing.updated.v1",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"job.processing.updated.v1:{job_version_id}:{revision.public_id}",
        payload={
            "jobId": str(request_body.jobId), "jobVersionId": str(job_version_id),
            "processingTaskId": str(task_id), "sourceHash": request_body.sourceHash,
            "status": "PARSED", "failureCode": None,
        },
    )
    await _publish(settings.kafka_job_processing_updated_topic, str(job_version_id), event)
    return ParsedJdResponse.from_revision(revision)


@router.post("/{job_version_id}/confirm", response_model=ParsedJdResponse)
async def confirm_parsed_jd(
    job_version_id: UUID,
    request_body: ConfirmParsedJdRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_recruiter),
    session: Session = Depends(get_session),
) -> ParsedJdResponse:
    repository = ParsedJdRevisionRepository(session)
    try:
        revision = repository.confirm(
            job_version_id=job_version_id, owner_user_id=principal.subject,
            expected_revision_id=request_body.expectedRevisionId, confirmed_by=principal.subject,
        )
    except LookupError as exception:
        raise ApiContractError(404, "PARSED_JD_REVISION_NOT_FOUND", str(exception)) from exception
    session.commit()
    settings = get_settings()
    event = _event(
        event_type="job.confirmed.v1",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"job.confirmed.v1:{job_version_id}:{revision.public_id}",
        payload={
            "jobId": str(revision.job_id), "jobVersionId": str(job_version_id),
            "parsedRevisionId": str(revision.public_id), "sourceHash": revision.source_hash,
            "confirmedBy": str(principal.subject),
        },
    )
    await _publish(settings.kafka_job_confirmed_topic, str(job_version_id), event)
    return ParsedJdResponse.from_revision(revision)


def _event(event_type: str, correlation_id: UUID, idempotency_key: str,
           payload: dict[str, object]) -> dict[str, object]:
    return {
        "eventId": str(uuid4()), "eventType": event_type, "schemaVersion": 1,
        "correlationId": str(correlation_id), "idempotencyKey": idempotency_key,
        "occurredAt": datetime.now(UTC).isoformat(), "payload": payload,
    }


async def _publish(topic: str, key: str, event: dict[str, object]) -> None:
    settings = get_settings()
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda value: json.dumps(value, separators=(",", ":")).encode("utf-8"),
    )
    try:
        await producer.start()
        await producer.send_and_wait(topic, key=key.encode("utf-8"), value=event)
    except Exception as exception:
        raise ApiContractError(
            503, "JOB_PROCESSING_EVENT_UNAVAILABLE",
            "Parsed JD is saved but status propagation is temporarily unavailable",
        ) from exception
    finally:
        await producer.stop()
