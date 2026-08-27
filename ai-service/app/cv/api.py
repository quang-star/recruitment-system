from datetime import UTC, datetime
import json
from typing import Any, Literal
from uuid import UUID, uuid4, uuid5
from pathlib import Path

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Request
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.cv.repository import ParsedCvRevision, ParsedCvRevisionRepository
from app.shared.api import ApiContractError
from app.shared.config import get_settings
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.normalizer import normalize_skill

router = APIRouter(
    prefix="/api/v1/parsed-cvs",
    tags=["parsed-cvs"],
    dependencies=[Depends(require_access_token)],
)


def require_candidate(principal: AuthenticatedPrincipal = Depends(require_access_token)) -> AuthenticatedPrincipal:
    if "CANDIDATE" not in principal.roles:
        raise ApiContractError(403, "CANDIDATE_ROLE_REQUIRED", "Candidate role is required")
    return principal


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


class UpdateParsedCvRequest(BaseModel):
    cvId: UUID
    expectedRevisionId: UUID = Field(description="Latest owned revision used for optimistic locking")
    payload: dict[str, Any]


@router.get("/{cv_version_id}", response_model=ParsedCvResponse)
def get_parsed_cv(cv_version_id: UUID, principal: AuthenticatedPrincipal = Depends(require_candidate),
                  session: Session = Depends(get_session)) -> ParsedCvResponse:
    revision = ParsedCvRevisionRepository(session).find_owned(cv_version_id, principal.subject)
    if revision is None:
        raise ApiContractError(404, "PARSED_CV_NOT_FOUND", "Parsed CV was not found")
    return ParsedCvResponse.from_revision(revision)


@router.put("/{cv_version_id}", response_model=ParsedCvResponse)
async def update_parsed_cv(
    cv_version_id: UUID,
    request_body: UpdateParsedCvRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_candidate),
    session: Session = Depends(get_session),
) -> ParsedCvResponse:
    repository = ParsedCvRevisionRepository(session)
    latest = repository.find_owned(cv_version_id, principal.subject)
    if latest is None:
        raise ApiContractError(404, "PARSED_CV_NOT_FOUND", "Parsed CV was not found")
    payload = _validate_user_payload(cv_version_id, request_body.payload, latest.payload)
    if latest.source_hash != payload["document"]["sourceHash"]:
        raise ApiContractError(422, "PARSED_CV_SOURCE_HASH_MISMATCH",
                               "document.sourceHash must match the uploaded CV version")
    try:
        revision = repository.create_revision(
            cv_version_id=cv_version_id,
            owner_user_id=principal.subject,
            source_hash=payload["document"]["sourceHash"],
            payload=payload,
            expected_revision_id=request_body.expectedRevisionId,
        )
    except ValueError as exception:
        raise ApiContractError(409, "PARSED_CV_REVISION_CONFLICT", str(exception)) from exception
    session.commit()
    settings = get_settings()
    task_id = uuid5(UUID("f5c2b49a-9f40-4d7b-9b47-2aa83ea1a2e7"), str(cv_version_id))
    event = _event(
        event_type="cv.processing.updated.v1",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"cv.processing.updated.v1:{cv_version_id}:{revision.public_id}",
        payload={
            "cvId": str(request_body.cvId), "cvVersionId": str(cv_version_id),
            "processingTaskId": str(task_id), "sourceHash": revision.source_hash,
            "status": "PARSED", "failureCode": None,
        },
    )
    await _publish(settings.kafka_cv_processing_updated_topic, str(cv_version_id), event)
    return ParsedCvResponse.from_revision(revision)


@router.post("/{cv_version_id}/confirm", response_model=ParsedCvResponse)
async def confirm_parsed_cv(
    cv_version_id: UUID,
    request_body: ConfirmParsedCvRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_candidate),
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
    except ValueError as exception:
        raise ApiContractError(409, "PARSED_CV_REVISION_CONFLICT", str(exception)) from exception

    session.commit()
    settings = get_settings()
    event = _event(
        event_type="cv.confirmed.v1",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"cv.confirmed.v1:{cv_version_id}:{revision.public_id}",
        payload={
            "cvVersionId": str(cv_version_id),
            "parsedRevisionId": str(revision.public_id),
            "sourceHash": revision.source_hash,
            "confirmedBy": str(principal.subject),
        },
    )
    await _publish(settings.kafka_cv_confirmed_topic, str(cv_version_id), event,
                   unavailable_code="CV_CONFIRMATION_EVENT_UNAVAILABLE",
                   unavailable_message="CV confirmation is saved but status propagation is temporarily unavailable")
    return ParsedCvResponse.from_revision(revision)


def _validate_user_payload(cv_version_id: UUID, payload: dict[str, Any],
                           prior_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if payload.get("schemaVersion") != "parsed-cv/1.0":
        raise ApiContractError(422, "PARSED_CV_SCHEMA_INVALID", "payload.schemaVersion must be parsed-cv/1.0")
    required_sections = ("document", "skills", "experiences", "projects",
                         "education", "certificates", "languages", "summary")
    missing = [section for section in required_sections if section not in payload]
    if missing:
        raise ApiContractError(422, "PARSED_CV_SCHEMA_INVALID",
                               f"payload is missing required sections: {', '.join(missing)}")
    document = payload.get("document")
    if not isinstance(document, dict):
        raise ApiContractError(422, "PARSED_CV_SCHEMA_INVALID", "payload.document is required")
    if document.get("cvVersionId") != str(cv_version_id):
        raise ApiContractError(422, "PARSED_CV_VERSION_MISMATCH", "payload belongs to another CV version")
    source_hash = document.get("sourceHash")
    if not isinstance(source_hash, str) or len(source_hash) != 64 or any(
        character not in "0123456789abcdef" for character in source_hash
    ):
        raise ApiContractError(422, "PARSED_CV_SOURCE_HASH_INVALID", "document.sourceHash must be lowercase SHA-256")
    for section in required_sections[1:-1]:
        if not isinstance(payload.get(section), list):
            raise ApiContractError(422, "PARSED_CV_SCHEMA_INVALID", f"payload.{section} must be an array")
    if not isinstance(payload.get("summary"), dict):
        raise ApiContractError(422, "PARSED_CV_SCHEMA_INVALID", "payload.summary must be an object")
    prior_skills: dict[str, dict[str, Any]] = {}
    for prior in (prior_payload or {}).get("skills", []):
        if isinstance(prior, dict):
            prior_skills[_skill_key(prior)] = prior
    # Normalize corrections server-side. Evidence and extraction provenance can
    # only be inherited from the prior owned revision; a browser cannot invent
    # parser evidence IDs or promote a newly asserted skill to confirmed.
    for skill in payload["skills"]:
        if isinstance(skill, dict):
            normalized = normalize_skill(str(skill.get("raw", "")))
            if normalized is None:
                skill["canonicalSkillId"] = None
                skill["normalizationStatus"] = "PENDING"
            else:
                skill["canonicalSkillId"] = normalized.stable_id
                skill["normalizationStatus"] = "KNOWN"
                skill["confidence"] = max(float(skill.get("confidence", 0)), 0.95)
            prior = prior_skills.get(_skill_key(skill))
            if prior is None:
                skill["evidenceIds"] = []
                skill["provenance"] = "USER_ASSERTED"
            else:
                skill["evidenceIds"] = list(prior.get("evidenceIds", []))
                skill["provenance"] = (
                    "USER_ASSERTED" if prior.get("provenance") == "USER_ASSERTED"
                    else "USER_CONFIRMED"
                )
    schema_path = Path(__file__).resolve().parents[3] / "contracts" / "schemas" / "parsed-cv-v1.schema.json"
    if not schema_path.exists():
        schema_path = Path("/app/contracts/schemas/parsed-cv-v1.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(payload),
                    key=lambda error: list(error.absolute_path))
    if errors:
        location = ".".join(str(part) for part in errors[0].absolute_path) or "payload"
        raise ApiContractError(422, "PARSED_CV_SCHEMA_INVALID", f"{location}: {errors[0].message}")
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


async def _publish(topic: str, key: str, event: dict[str, object],
                   unavailable_code: str = "CV_PROCESSING_EVENT_UNAVAILABLE",
                   unavailable_message: str = "Parsed CV is saved but status propagation is temporarily unavailable") -> None:
    settings = get_settings()
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda value: json.dumps(value, separators=(",", ":")).encode("utf-8"),
    )
    try:
        await producer.start()
        await producer.send_and_wait(topic, key=key.encode("utf-8"), value=event)
    except Exception as exception:
        raise ApiContractError(503, unavailable_code, unavailable_message) from exception
    finally:
        await producer.stop()
