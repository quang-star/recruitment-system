"""SQL-bounded metadata previews; live Core admission is checked by every step."""
from app.shared.identities import parse_id
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, aliased

from app.cv.repository import ParsedCvHeadRecord, ParsedCvRevisionRecord
from app.cv.parser import PARSER_VERSION as CV_PROCESSOR
from app.jd.repository import ParsedJdHeadRecord, ParsedJdRevisionRecord
from app.jd.parser import PARSER_VERSION as JD_PROCESSOR
from app.matching.algorithm import ALGORITHM_VERSION
from app.matching.repository import MatchingHeadRecord, MatchingResultRecord
from app.matching.shadow import MatchingShadowResult
from app.evaluation.semantic import HYBRID_VERSION, MODEL_ID, MODEL_REVISION, SEMANTIC_WEIGHT
from app.reprocessing.models import ImpactRequest, Operation
from app.shared.api import ApiContractError
from app.shared.config import Settings
from app.shared.privacy import PrivacyTombstone
from app.taxonomy.catalog import TaxonomyVersionRecord, head

MAX_ITEMS = 1000


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def target_config(session: Session, settings: Settings, body: ImpactRequest, *, historical: bool = False) -> dict:
    current = f"1.0.{head(session).published_version}"
    version = body.taxonomyVersion or current
    if not historical and version != current:
        raise ApiContractError(422, "REPROCESS_TARGET_UNSUPPORTED", "Only the current published taxonomy can start a batch")
    published = session.get(TaxonomyVersionRecord, version)
    if published is None or published.payload is None:
        raise ApiContractError(409, "REPROCESS_TARGET_UNAVAILABLE", "An immutable taxonomy snapshot is required")
    return {
        "configurationVersion": "reprocessing-local-v1", "taxonomyVersion": version,
        "taxonomyHash": published.source_hash, "cvSchemaVersion": "parsed-cv/2.0", "jdSchemaVersion": "parsed-jd/2.0",
        "cvProcessorVersion": CV_PROCESSOR, "jdProcessorVersion": JD_PROCESSOR,
        "algorithmVersion": ALGORITHM_VERSION, "matchingMode": settings.matching_mode,
        "shadowAlgorithmVersion": HYBRID_VERSION if settings.matching_mode == "shadow" else None,
        "modelId": MODEL_ID if settings.matching_mode == "shadow" else None,
        "modelRevision": MODEL_REVISION if settings.matching_mode == "shadow" else None,
        "semanticWeight": SEMANTIC_WEIGHT if settings.matching_mode == "shadow" else None,
        "semanticMaxInputChars": settings.semantic_max_input_chars,
        "asOfMonth": body.asOfMonth or datetime.now(UTC).strftime("%Y-%m"),
        "externalAi": False, "ocrEnabled": settings.ocr_enabled,
        "ocrMaxPages": settings.ocr_max_pages, "ocrTimeoutSeconds": settings.ocr_timeout_seconds,
    }


@dataclass(frozen=True, slots=True)
class ImpactItem:
    operation: Operation
    resource_id: int
    cv_version_id: int | None
    job_version_id: int | None
    application_id: int | None
    snapshot: dict
    current_hash: str
    reasons: list[str]
    ready: bool
    before: dict

    def public(self) -> dict:
        return {"operation": self.operation, "resourceId": str(self.resource_id),
                "currentHash": self.current_hash, "reasons": self.reasons,
                "ready": self.ready, "requiresLiveCheck": self.ready, "before": self.before}


def _live(kind: str, identity):
    return ~exists(select(PrivacyTombstone.resource_id).where(
        PrivacyTombstone.kind == kind, PrivacyTombstone.resource_id == identity))


def _parse_items(session: Session, operation: Operation, target: dict, ids: list[int] | None) -> list[ImpactItem]:
    cv = operation == "PARSE_CV"
    record = ParsedCvRevisionRecord.__table__ if cv else ParsedJdRevisionRecord.__table__
    head_record = ParsedCvHeadRecord.__table__ if cv else ParsedJdHeadRecord.__table__
    newer = record.alias("newer_revision")
    confirmed = record.alias("confirmed_revision")
    resource = record.c.cv_version_id if cv else record.c.job_version_id
    newer_resource = newer.c.cv_version_id if cv else newer.c.job_version_id
    head_resource = head_record.c.cv_version_id if cv else head_record.c.job_version_id
    columns = [resource.label("resource"), record.c.id.label("revisionId"),
               record.c.owner_user_id.label("ownerId"), record.c.source_hash.label("sourceHash"),
               record.c.version.label("revisionVersion"), record.c.status.label("revisionStatus"),
               confirmed.c.id.label("confirmedRevisionId"), head_record.c.version.label("headVersion"),
               record.c.payload["schemaVersion"].as_string().label("schemaVersion"),
               record.c.payload["document"]["taxonomyVersion"].as_string().label("taxonomyVersion"),
               record.c.payload["document"]["parserVersion"].as_string().label("parserVersion")]
    if not cv:
        columns.append(record.c.job_id.label("jobId"))
    statement = select(*columns).select_from(record).outerjoin(head_record, head_resource == resource).outerjoin(
        confirmed, confirmed.c.id == head_record.c.revision_id).where(
        ~exists(select(newer.c.id).where(newer_resource == resource, newer.c.revision_number > record.c.revision_number)),
        _live("CV" if cv else "JD", resource))
    if ids is not None:
        statement = statement.where(resource.in_(ids))
    rows = session.execute(statement.order_by(resource).limit(MAX_ITEMS + 1)).mappings().all()
    result = []
    for row in rows:
        state = {key: str(value) if isinstance(value, int) else value for key, value in row.items()}
        identity = parse_id(str(state.pop("resource")))
        expected_processor = target["cvProcessorVersion" if cv else "jdProcessorVersion"] + "+taxonomy-" + target["taxonomyVersion"]
        reasons = []
        if state["taxonomyVersion"] != target["taxonomyVersion"]:
            reasons.append("STALE_TAXONOMY")
        if state["schemaVersion"] != target["cvSchemaVersion" if cv else "jdSchemaVersion"]:
            reasons.append("STALE_SCHEMA")
        if state["parserVersion"] != expected_processor:
            reasons.append("STALE_PROCESSOR")
        ready = bool(reasons)
        if not all(state[key] for key in ("taxonomyVersion", "schemaVersion", "parserVersion")):
            reasons.append("INPUT_PROVENANCE_UNAVAILABLE")
            ready = False
        before = {key: state[key] for key in ("revisionId", "confirmedRevisionId", "schemaVersion", "taxonomyVersion", "parserVersion")}
        result.append(ImpactItem(operation, identity, identity if cv else None, None if cv else identity, None,
                                 state, digest(state), reasons or ["CURRENT_NO_CHANGE"], ready, before))
    return result


def _matching_items(session: Session, target: dict, ids: list[int] | None) -> list[ImpactItem]:
    cv, jd = aliased(ParsedCvRevisionRecord), aliased(ParsedJdRevisionRecord)
    result = MatchingResultRecord
    statement = select(result.application_id.label("resource"), result.id.label("priorResultId"),
        result.cv_version_id.label("cvVersionId"), result.job_version_id.label("jobVersionId"),
        result.cv_revision_id.label("priorCvRevisionId"), result.jd_revision_id.label("priorJdRevisionId"),
        result.algorithm_version.label("algorithmVersion"), result.taxonomy_version.label("taxonomyVersion"),
        result.as_of_month.label("asOfMonth"), cv.id.label("cvRevisionId"), jd.id.label("jdRevisionId"),
        cv.version.label("cvRevisionVersion"), jd.version.label("jdRevisionVersion"),
        cv.payload["document"]["taxonomyVersion"].as_string().label("cvTaxonomyVersion"),
        jd.payload["document"]["taxonomyVersion"].as_string().label("jdTaxonomyVersion"),
        MatchingShadowResult.model_id.label("modelId"), MatchingShadowResult.model_revision.label("modelRevision"),
        MatchingShadowResult.algorithm_version.label("shadowAlgorithmVersion"),
        MatchingShadowResult.semantic_weight.label("semanticWeight"),
    ).join(MatchingHeadRecord, MatchingHeadRecord.result_id == result.id).outerjoin(
        ParsedCvHeadRecord, ParsedCvHeadRecord.cv_version_id == result.cv_version_id).outerjoin(
        cv, cv.id == ParsedCvHeadRecord.revision_id).outerjoin(
        ParsedJdHeadRecord, ParsedJdHeadRecord.job_version_id == result.job_version_id).outerjoin(
        jd, jd.id == ParsedJdHeadRecord.revision_id).outerjoin(
        MatchingShadowResult, MatchingShadowResult.matching_result_id == result.id).where(
        _live("APPLICATION", result.application_id), _live("CV", result.cv_version_id), _live("JD", result.job_version_id))
    if ids is not None:
        statement = statement.where(result.application_id.in_(ids))
    rows = session.execute(statement.order_by(result.application_id).limit(MAX_ITEMS + 1)).mappings().all()
    items = []
    for row in rows:
        state = {key: str(value) if isinstance(value, int) else value for key, value in row.items()}
        identity = parse_id(str(state.pop("resource")))
        reasons = []
        if state["algorithmVersion"] != target["algorithmVersion"]:
            reasons.append("STALE_ALGORITHM")
        if state["taxonomyVersion"] != target["taxonomyVersion"]:
            reasons.append("STALE_TAXONOMY")
        if state["priorCvRevisionId"] != state["cvRevisionId"] or state["priorJdRevisionId"] != state["jdRevisionId"]:
            reasons.append("INPUT_REVISION_CHANGED")
        if state["asOfMonth"] != target["asOfMonth"]:
            reasons.append("STALE_AS_OF_MONTH")
        if target["matchingMode"] == "shadow" and any(
            state[field] != target[field] for field in ("modelId", "modelRevision", "shadowAlgorithmVersion", "semanticWeight")
        ):
            reasons.append("STALE_MODEL_CONFIGURATION")
        ready = bool(reasons)
        if not state["cvRevisionId"] or not state["jdRevisionId"]:
            reasons.append("INPUT_NOT_CONFIRMED")
            ready = False
        elif state["cvTaxonomyVersion"] != target["taxonomyVersion"] or state["jdTaxonomyVersion"] != target["taxonomyVersion"]:
            reasons.append("INPUT_REVIEW_REQUIRED")
            ready = False
        before = {key: state[key] for key in ("priorResultId", "algorithmVersion", "taxonomyVersion", "asOfMonth",
                                              "priorCvRevisionId", "priorJdRevisionId", "modelId", "modelRevision")}
        items.append(ImpactItem("MATCH_APPLICATION", identity, parse_id(state["cvVersionId"]), parse_id(state["jobVersionId"]),
                                identity, state, digest(state), reasons or ["CURRENT_NO_CHANGE"], ready, before))
    return items


def impact_items(session: Session, body: ImpactRequest, target: dict) -> list[ImpactItem]:
    items = _matching_items(session, target, body.resourceIds) if body.operation == "MATCH_APPLICATION" else _parse_items(
        session, body.operation, target, body.resourceIds)
    if len(items) > MAX_ITEMS:
        raise ApiContractError(422, "REPROCESS_SELECTION_LIMIT", "Narrow the selection to at most 1000 source versions or Applications")
    if body.resourceIds is not None and {item.resource_id for item in items} != set(body.resourceIds):
        raise ApiContractError(404, "REPROCESS_SOURCE_NOT_FOUND", "One or more selected sources are unavailable")
    return items


def preview(session: Session, settings: Settings, body: ImpactRequest) -> tuple[dict, list[ImpactItem]]:
    target = target_config(session, settings, body)
    items = impact_items(session, body, target)
    payload = {"operation": body.operation, "target": target, "targetHash": digest(target),
               "items": [item.public() for item in items], "total": len(items), "limit": MAX_ITEMS,
               "selectionComplete": True, "externalAi": False}
    payload["previewHash"] = digest(payload)
    return payload, items
