from datetime import UTC, datetime
import json
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4, uuid5

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Request
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.jd.repository import ParsedJdRevision, ParsedJdRevisionRepository
from app.shared.api import ApiContractError
from app.shared.config import get_settings
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.normalizer import normalize_skill

router = APIRouter(
    prefix="/api/v1/parsed-jds",
    tags=["parsed-jds"],
    dependencies=[Depends(require_access_token)],
)


def require_recruiter(principal: AuthenticatedPrincipal = Depends(require_access_token)) -> AuthenticatedPrincipal:
    if "RECRUITER" not in principal.roles:
        raise ApiContractError(403, "RECRUITER_ROLE_REQUIRED", "Recruiter role is required")
    return principal


class ConfirmParsedJdRequest(BaseModel):
    expectedRevisionId: UUID = Field(description="Revision shown to the recruiter before confirmation")


class UpdateParsedJdRequest(BaseModel):
    expectedRevisionId: UUID
    payload: dict[str, Any]


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


@router.patch("/{job_version_id}", response_model=ParsedJdResponse)
async def update_parsed_jd(
    job_version_id: UUID,
    request_body: UpdateParsedJdRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_recruiter),
    session: Session = Depends(get_session),
) -> ParsedJdResponse:
    repository = ParsedJdRevisionRepository(session)
    latest = repository.find_owned(job_version_id, principal.subject)
    if latest is None:
        raise ApiContractError(404, "PARSED_JD_NOT_FOUND", "Parsed JD was not found")
    payload = _validate_user_payload(
        job_version_id, latest.source_hash, request_body.payload, latest.payload,
    )
    try:
        revision = repository.create_revision(
            job_id=latest.job_id, job_version_id=job_version_id,
            owner_user_id=principal.subject, source_hash=latest.source_hash,
            payload=payload, expected_revision_id=request_body.expectedRevisionId,
        )
    except ValueError as exception:
        raise ApiContractError(409, "PARSED_JD_REVISION_CONFLICT", str(exception)) from exception
    session.commit()
    settings = get_settings()
    task_id = uuid5(UUID("b73b8a62-d9ba-4d26-9a7e-96f1c84c3e75"), str(job_version_id))
    event = _event(
        event_type="job.processing.updated.v1",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"job.processing.updated.v1:{job_version_id}:{revision.public_id}",
        payload={
            "jobId": str(revision.job_id), "jobVersionId": str(job_version_id),
            "processingTaskId": str(task_id), "sourceHash": revision.source_hash,
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
    except ValueError as exception:
        raise ApiContractError(409, "PARSED_JD_REVISION_CONFLICT", str(exception)) from exception
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


def _validate_user_payload(job_version_id: UUID, source_hash: str,
                           payload: dict[str, Any],
                           prior_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    document = payload.get("document")
    if not isinstance(document, dict) or document.get("jobVersionId") != str(job_version_id):
        raise ApiContractError(422, "PARSED_JD_VERSION_MISMATCH",
                               "payload belongs to another Job version")
    if document.get("sourceHash") != source_hash:
        raise ApiContractError(422, "PARSED_JD_SOURCE_HASH_MISMATCH",
                               "document.sourceHash must match the immutable Job version")
    requirements = payload.get("requirements")
    if not isinstance(requirements, dict):
        raise ApiContractError(422, "PARSED_JD_SCHEMA_INVALID", "payload.requirements is required")
    prior_skills: dict[str, dict[str, Any]] = {}
    prior_requirements = (prior_payload or {}).get("requirements", {})
    if isinstance(prior_requirements, dict):
        for section in ("requiredSkills", "preferredSkills"):
            for skill in prior_requirements.get(section, []):
                if isinstance(skill, dict):
                    prior_skills[_skill_key(skill)] = skill
    for section, criticality in (("requiredSkills", "CRITICAL"), ("preferredSkills", "NORMAL")):
        skills = requirements.get(section)
        if not isinstance(skills, list):
            raise ApiContractError(422, "PARSED_JD_SCHEMA_INVALID",
                                   f"payload.requirements.{section} must be an array")
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            normalized = normalize_skill(str(skill.get("raw", "")))
            skill["canonicalSkillId"] = normalized.stable_id if normalized else None
            skill["normalizationStatus"] = "KNOWN" if normalized else "PENDING"
            skill["criticality"] = criticality
            skill["confirmedByRecruiter"] = True
            prior = prior_skills.get(_skill_key(skill))
            skill["evidenceIds"] = list(prior.get("evidenceIds", [])) if prior else []
            if normalized:
                skill["confidence"] = max(float(skill.get("confidence", 0)), 0.95)
    title = payload.get("title")
    if isinstance(title, dict):
        title["confidence"] = max(float(title.get("confidence", 0)), 0.95)
        prior_title = (prior_payload or {}).get("title", {})
        title["evidenceIds"] = (
            list(prior_title.get("evidenceIds", []))
            if isinstance(prior_title, dict) and prior_title.get("raw") == title.get("raw") else []
        )
    prior_responsibilities = {
        str(item.get("raw", "")): item
        for item in (prior_payload or {}).get("responsibilities", [])
        if isinstance(item, dict)
    }
    for responsibility in payload.get("responsibilities", []):
        if isinstance(responsibility, dict):
            responsibility["confirmedByRecruiter"] = True
            prior = prior_responsibilities.get(str(responsibility.get("raw", "")))
            responsibility["evidenceIds"] = list(prior.get("evidenceIds", [])) if prior else []
    schema_path = Path(__file__).resolve().parents[3] / "contracts" / "schemas" / "parsed-jd-v1.schema.json"
    if not schema_path.exists():
        schema_path = Path("/app/contracts/schemas/parsed-jd-v1.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(payload),
                    key=lambda error: list(error.absolute_path))
    if errors:
        location = ".".join(str(part) for part in errors[0].absolute_path) or "payload"
        raise ApiContractError(422, "PARSED_JD_SCHEMA_INVALID", f"{location}: {errors[0].message}")
    return payload


def _skill_key(skill: dict[str, Any]) -> str:
    normalized = normalize_skill(str(skill.get("raw", "")))
    if normalized is not None:
        return f"known:{normalized.stable_id}"
    return f"raw:{str(skill.get('raw', '')).strip().casefold()}"


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
