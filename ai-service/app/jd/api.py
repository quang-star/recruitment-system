from app.shared.api_ids import BusinessId
from datetime import UTC, datetime
import json
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Request
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.jd.repository import ParsedJdRevision, ParsedJdRevisionRepository
from app.task.persistence import SqlAlchemyProcessingTaskRepository
from app.task.domain import TaskType
from app.outbox import enqueue
from app.shared.api import ApiContractError
from app.shared.config import get_settings
from app.shared.database import get_session
from app.shared.revision_status import ParsedRevisionStatus, validate_revision_status
from app.shared.evidence import inherit_review_evidence
from app.shared.skill_proposals import skill_name_key
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.normalizer import normalize_skill
from app.taxonomy.normalizer import use_taxonomy, taxonomy_version
from app.taxonomy.catalog import snapshot
from app.taxonomy.occurrences import record_jd_revision, require_live_jd

router = APIRouter(
    prefix="/api/v2/parsed-jds",
    tags=["parsed-jds"],
    dependencies=[Depends(require_access_token)],
)


def require_recruiter(principal: AuthenticatedPrincipal = Depends(require_access_token)) -> AuthenticatedPrincipal:
    if "RECRUITER" not in principal.roles:
        raise ApiContractError(403, "RECRUITER_ROLE_REQUIRED", "Recruiter role is required")
    return principal


class ConfirmParsedJdRequest(BaseModel):
    expectedRevisionId: BusinessId = Field(description="Revision shown to the recruiter before confirmation")


class UpdateParsedJdRequest(BaseModel):
    expectedRevisionId: BusinessId
    payload: dict[str, Any]


class ParsedJdResponse(BaseModel):
    revisionId: BusinessId
    jobId: BusinessId
    jobVersionId: BusinessId
    revisionNumber: int
    sourceHash: str
    status: ParsedRevisionStatus
    payload: dict[str, Any]
    confirmedBy: BusinessId | None
    confirmedAt: datetime | None
    version: int

    @classmethod
    def from_revision(cls, revision: ParsedJdRevision) -> "ParsedJdResponse":
        return cls(
            revisionId=revision.id, jobId=revision.job_id,
            jobVersionId=revision.job_version_id, revisionNumber=revision.revision_number,
            sourceHash=revision.source_hash,
            status=validate_revision_status(revision.status), payload=revision.payload,
            confirmedBy=revision.confirmed_by, confirmedAt=revision.confirmed_at,
            version=revision.version,
        )


@router.get("/{job_version_id}", response_model=ParsedJdResponse)
def get_parsed_jd(job_version_id: BusinessId,
                  principal: AuthenticatedPrincipal = Depends(require_recruiter),
                  session: Session = Depends(get_session)) -> ParsedJdResponse:
    revision = ParsedJdRevisionRepository(session).find_owned(job_version_id, principal.subject)
    if revision is None:
        raise ApiContractError(404, "PARSED_JD_NOT_FOUND", "Parsed JD was not found")
    return ParsedJdResponse.from_revision(revision)


@router.patch("/{job_version_id}", response_model=ParsedJdResponse)
async def update_parsed_jd(
    job_version_id: BusinessId,
    request_body: UpdateParsedJdRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_recruiter),
    session: Session = Depends(get_session),
) -> ParsedJdResponse:
    require_live_jd(session, job_version_id)
    repository = ParsedJdRevisionRepository(session)
    latest = repository.find_owned(job_version_id, principal.subject)
    if latest is None:
        raise ApiContractError(404, "PARSED_JD_NOT_FOUND", "Parsed JD was not found")
    with use_taxonomy(snapshot(session)):
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
    record_jd_revision(session, revision, correlation_id=request.state.correlation_id)
    settings = get_settings()
    task = SqlAlchemyProcessingTaskRepository(session).find_by_resource_id(job_version_id, TaskType.PARSE_JD)
    event = _event(
        event_type="job.processing.updated.v2",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"job.processing.updated.v2:{job_version_id}:{revision.id}",
        payload={
            "jobId": str(revision.job_id), "jobVersionId": str(job_version_id),
            "processingTaskId": str(task.id) if task else None, "sourceHash": revision.source_hash,
            "status": "PARSED", "failureCode": None,
        },
    )
    enqueue(session, settings.kafka_job_processing_updated_topic, str(job_version_id), event)
    session.commit()
    return ParsedJdResponse.from_revision(revision)


@router.post("/{job_version_id}/confirm", response_model=ParsedJdResponse)
async def confirm_parsed_jd(
    job_version_id: BusinessId,
    request_body: ConfirmParsedJdRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_recruiter),
    session: Session = Depends(get_session),
) -> ParsedJdResponse:
    require_live_jd(session, job_version_id)
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
    record_jd_revision(session, revision, correlation_id=request.state.correlation_id)
    settings = get_settings()
    event = _event(
        event_type="job.confirmed.v2",
        correlation_id=request.state.correlation_id,
        idempotency_key=f"job.confirmed.v2:{job_version_id}:{revision.id}",
        payload={
            "jobId": str(revision.job_id), "jobVersionId": str(job_version_id),
            "parsedRevisionId": str(revision.id), "sourceHash": revision.source_hash,
            "confirmedBy": str(principal.subject),
        },
    )
    enqueue(session, settings.kafka_job_confirmed_topic, str(job_version_id), event)
    session.commit()
    return ParsedJdResponse.from_revision(revision)


def _validate_user_payload(job_version_id: BusinessId, source_hash: str,
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
    document["taxonomyVersion"] = taxonomy_version()
    prior_skills: dict[str, dict[str, Any]] = {}
    payload["evidence"] = list((prior_payload or {}).get("evidence", []))
    prior_requirements = (prior_payload or {}).get("requirements", {})
    if isinstance(prior_requirements, dict):
        for section in ("requiredSkills", "preferredSkills"):
            for skill in prior_requirements.get(section, []):
                if isinstance(skill, dict):
                    prior_skills[_skill_key(skill)] = skill
    seen_skills: set[str] = set()
    for section, criticality in (("requiredSkills", "CRITICAL"), ("preferredSkills", "NORMAL")):
        skills = requirements.get(section)
        if not isinstance(skills, list):
            raise ApiContractError(422, "PARSED_JD_SCHEMA_INVALID",
                                   f"payload.requirements.{section} must be an array")
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            raw = skill.get("raw")
            if not isinstance(raw, str) or not raw.strip() or len(raw) > 240 or any(
                character in raw for character in "\r\n"
            ):
                raise ApiContractError(422, "PARSED_JD_SKILL_NAME_INVALID",
                                       "Skill names must contain 1–240 characters on one line")
            normalized = normalize_skill(raw)
            skill["canonicalSkillId"] = normalized.stable_id if normalized else None
            skill["normalizationStatus"] = "KNOWN" if normalized else "PENDING"
            skill["criticality"] = criticality
            # Saving an unknown name is not the confirmation of this JD revision.
            skill["confirmedByRecruiter"] = normalized is not None
            key = _skill_key(skill)
            if key in seen_skills:
                raise ApiContractError(422, "PARSED_JD_DUPLICATE_SKILL",
                                       "A skill cannot occur twice or in both requirement groups")
            seen_skills.add(key)
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
    schema_path = Path(__file__).resolve().parents[3] / "contracts" / "schemas" / "parsed-jd-v2.schema.json"
    if not schema_path.exists():
        schema_path = Path("/app/contracts/schemas/parsed-jd-v2.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(payload),
                    key=lambda error: list(error.absolute_path))
    if errors:
        location = ".".join(str(part) for part in errors[0].absolute_path) or "payload"
        raise ApiContractError(422, "PARSED_JD_SCHEMA_INVALID", f"{location}: {errors[0].message}")
    for section in ("education", "languages"):
        inherit_review_evidence(requirements[section], prior_requirements.get(section, []))
    inherit_review_evidence(payload["responsibilities"], (prior_payload or {}).get("responsibilities", []))
    return payload


def _skill_key(skill: dict[str, Any]) -> str:
    normalized = normalize_skill(str(skill.get("raw", "")))
    if normalized is not None:
        return f"known:{normalized.stable_id}"
    return f"raw:{skill_name_key(str(skill.get('raw', '')))}"


def _event(event_type: str, correlation_id: UUID, idempotency_key: str,
           payload: dict[str, object]) -> dict[str, object]:
    return {
        "eventId": str(uuid4()), "eventType": event_type, "schemaVersion": 2,
        "correlationId": str(correlation_id), "idempotencyKey": idempotency_key,
        "occurredAt": datetime.now(UTC).isoformat(), "payload": payload,
    }
