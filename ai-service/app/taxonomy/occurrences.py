"""Source-backed skill observations; Admin receives metadata, never document text."""
from app.shared.identities import parse_id
from app.shared.database import BUSINESS_ID
from datetime import UTC, datetime
from dataclasses import dataclass
import hashlib
import logging
import math
from typing import Literal
from uuid import UUID

from sqlalchemy import (Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Uuid,
                        case, cast, delete, exists, func, select, true, update)
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.cv.repository import ParsedCvRevision, ParsedCvRevisionRecord, ParsedCvRevisionRepository
from app.jd.repository import ParsedJdRevision, ParsedJdRevisionRecord, ParsedJdRevisionRepository
from app.shared.api import ApiContractError
from app.shared.database import Base
from app.shared.extraction_privacy import redact_contacts
from app.shared.privacy import PrivacyTombstone, erased, lock_resource, require_live_cv
from app.taxonomy.catalog import CATALOG_LIMIT, change, head
from app.taxonomy.audit import catalog_projection
from app.taxonomy.definitions import compatible_skill
from app.taxonomy.normalizer import _key

SourceKind = Literal["CV", "JD"]
QueueStatus = Literal["PENDING", "DEFERRED", "REJECTED", "ACTIVE", "MERGED"]
QueueSort = Literal["OCCURRENCES_DESC", "LAST_SEEN_DESC", "FIRST_SEEN_ASC"]
LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RecordingResult:
    recorded_count: int = 0
    skipped_catalog_limit_count: int = 0


class SkillSourceOccurrence(Base):
    __tablename__ = "skill_source_occurrences"
    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    identity_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    skill_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, index=True)
    source_kind: Mapped[str] = mapped_column(String(2), nullable=False)
    source_version_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, index=True)
    normalized_term: Mapped[str] = mapped_column(String(240), nullable=False)
    raw_term: Mapped[str] = mapped_column(String(240), nullable=False)
    field_role: Mapped[str] = mapped_column(String(30), nullable=False)
    first_revision_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    latest_revision_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    latest_revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    provenance: Mapped[str] = mapped_column(String(20), nullable=False)
    normalization_status: Mapped[str] = mapped_column(String(10), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    evidence_refs: Mapped[list] = mapped_column(JSON, nullable=False)
    safe_context: Mapped[dict] = mapped_column(JSON, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SkillOccurrenceRevision(Base):
    __tablename__ = "skill_occurrence_revisions"
    occurrence_id: Mapped[int] = mapped_column(BUSINESS_ID, ForeignKey("skill_source_occurrences.id", ondelete="CASCADE"), primary_key=True)
    revision_id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    observed_canonical_skill_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    normalization_status: Mapped[str] = mapped_column(String(10), nullable=False)
    provenance: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    evidence_refs: Mapped[list] = mapped_column(JSON, nullable=False)
    safe_context: Mapped[dict] = mapped_column(JSON, nullable=False)
    taxonomy_version: Mapped[str | None] = mapped_column(String(32))
    parser_version: Mapped[str | None] = mapped_column(String(240))
    correlation_id: Mapped[UUID | None] = mapped_column(Uuid)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def _safe_term(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    term = raw.strip()
    key = _key(term)
    if (not term or len(term) > 240 or len(key) > 240 or any(ord(char) < 32 or char == "█" for char in term)
            or redact_contacts(term) != term or redact_contacts(key) != key):
        return None
    return term


def _business_id(value) -> int | None:
    try:
        return parse_id(str(value)) if value is not None else None
    except (ValueError, TypeError, AttributeError):
        return None


def _time(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _confidence(value) -> float | None:
    if not isinstance(value, (float, int)) or isinstance(value, bool) or not math.isfinite(value) or not 0 <= value <= 1:
        return None
    return float(value)


def _evidence(item: dict, locations: dict) -> list:
    result = []
    for value in item.get("evidenceIds", []):
        identity = _business_id(value)
        location = locations.get(str(identity)) if identity is not None else None
        if not isinstance(location, dict):
            continue
        start, end, page = location.get("start"), location.get("end"), location.get("page")
        if (not isinstance(start, int) or isinstance(start, bool) or not isinstance(end, int) or isinstance(end, bool)
                or start < 0 or end < start or (page is not None and (not isinstance(page, int) or isinstance(page, bool) or page < 1))):
            continue
        safe = {"id": str(identity), "page": page, "start": start, "end": end}
        if safe not in result:
            result.append(safe)
    return result


def _groups(kind: SourceKind, payload: dict) -> list[tuple[str, list]]:
    if kind == "CV":
        return [("CV.skills", payload.get("skills", []))]
    requirements = payload.get("requirements", {})
    return [("JD.requiredSkills", requirements.get("requiredSkills", [])),
            ("JD.preferredSkills", requirements.get("preferredSkills", []))]


def _resolved_id(skills: list, identity: int) -> int:
    entries = {entry["stableId"]: entry for entry in skills}
    current = str(identity)
    seen: set[str] = set()
    while current in entries and entries[current]["status"] == "MERGED":
        if current in seen:
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Skill redirect is unavailable")
        seen.add(current)
        current = entries[current]["mergedIntoId"]
    if current not in entries:
        raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Skill redirect is unavailable")
    return parse_id(current)


def _skill_id(session: Session, actor: int, term: str, kind: SourceKind, correlation_id: UUID | None) -> int:
    catalog = head(session, lock=True)
    key = _key(term)
    for entry in catalog.skills:
        if entry["status"] not in ("ACTIVE", "PENDING", "DEFERRED", "MERGED"):
            continue
        terms = [entry["canonicalName"], entry["normalizedName"]]
        terms += [term for alias in entry.get("aliases", []) for term in (alias["value"], alias["normalized"])]
        if key not in {_key(value) for value in terms}:
            continue
        return _resolved_id(catalog.skills, parse_id(entry["stableId"]))
    created = change(session, actor, catalog.version, action="PROPOSE", name=term,
                     reason=f"Unknown skill observed in a {kind} revision", correlation_id=correlation_id)
    return parse_id(created["skill"]["stableId"])


def record_cv_revision(session: Session, revision: ParsedCvRevision, *, correlation_id: UUID | None = None) -> RecordingResult:
    require_live_cv(session, revision.cv_version_id)
    latest = session.scalar(select(ParsedCvRevisionRecord)
                            .where(ParsedCvRevisionRecord.cv_version_id == revision.cv_version_id)
                            .order_by(ParsedCvRevisionRecord.revision_number.desc()).limit(1))
    if latest is not None and latest.id == revision.id and latest.source_hash == revision.source_hash:
        persisted = ParsedCvRevisionRepository._to_domain(latest, None)
        return _record(session, persisted, "CV", latest.cv_version_id, _time(latest.created_at), correlation_id)
    return RecordingResult()


def record_jd_revision(session: Session, revision: ParsedJdRevision, *, correlation_id: UUID | None = None) -> RecordingResult:
    require_live_jd(session, revision.job_version_id)
    latest = session.scalar(select(ParsedJdRevisionRecord)
                            .where(ParsedJdRevisionRecord.job_version_id == revision.job_version_id)
                            .order_by(ParsedJdRevisionRecord.revision_number.desc()).limit(1))
    if latest is not None and latest.id == revision.id and latest.source_hash == revision.source_hash:
        persisted = ParsedJdRevisionRepository._to_domain(latest, None)
        return _record(session, persisted, "JD", latest.job_version_id, _time(latest.created_at), correlation_id)
    return RecordingResult()


def require_live_jd(session: Session, version_id: int) -> None:
    lock_resource(session, "JD", version_id)
    if erased(session, "JD", version_id):
        raise ApiContractError(410, "JD_SOURCE_REMOVED", "JD source is unavailable")


def _record(session: Session, revision: ParsedCvRevision | ParsedJdRevision, kind: SourceKind,
            version_id: int, observed_at: datetime, correlation_id: UUID | None) -> RecordingResult:
    # Serialize catalog mapping before locking/updating ledger rows. All writers
    # acquire source -> catalog -> ledger; no caller may invert this order.
    catalog = head(session, lock=True)
    defined_ids = {entry["stableId"] for entry in catalog.skills}
    locations = {str(item.get("id")): item for item in revision.payload.get("evidence", []) if isinstance(item, dict)}
    existing = session.scalars(select(SkillSourceOccurrence).where(
        SkillSourceOccurrence.source_kind == kind, SkillSourceOccurrence.source_version_id == version_id)).all()
    by_identity = {item.identity_hash: item for item in existing}
    recorded, skipped_capacity = set(), set()
    for item in existing:
        item.active = False
    document = revision.payload.get("document", {})
    for role, items in _groups(kind, revision.payload):
        known = sorted({str(item["canonicalSkillId"]) for item in items if isinstance(item, dict)
                        and item.get("normalizationStatus") == "KNOWN" and str(item.get("canonicalSkillId")) in defined_ids})[:20]
        for item in items:
            term = _safe_term(item.get("raw")) if isinstance(item, dict) else None
            if term is None or item.get("normalizationStatus") not in ("KNOWN", "PENDING"):
                continue
            identity = hashlib.sha256(f"{kind}:{version_id}:{role}:{_key(term)}".encode()).hexdigest()
            occurrence = by_identity.get(identity)
            observed_id = _business_id(item.get("canonicalSkillId"))
            mapping = (_resolved_id(catalog.skills, observed_id) if observed_id is not None and str(observed_id) in defined_ids else None)
            if occurrence is None:
                try:
                    mapping = mapping or _skill_id(session, revision.owner_user_id, term, kind, correlation_id)
                except ApiContractError as exception:
                    if exception.code != "SKILL_CATALOG_LIMIT":
                        raise
                    # The source remains valid at capacity. Only a new, unmapped
                    # observation is skipped; never invent a canonical mapping.
                    skipped_capacity.add(identity)
                    continue
            else:
                mapping = mapping or occurrence.skill_id
            refs = _evidence(item, locations)
            provenance = item.get("provenance") if kind == "CV" else (
                "USER_CONFIRMED" if refs and revision.status == "CONFIRMED" else "EXTRACTED" if refs else "USER_ASSERTED")
            if provenance not in ("EXTRACTED", "USER_CONFIRMED", "USER_ASSERTED"):
                provenance = "EXTRACTED" if refs else "USER_ASSERTED"
            context = {"fieldRole": role, "provenance": provenance, "knownSkillIds": known,
                       "sourceConfirmed": revision.status == "CONFIRMED"}
            if item.get("criticality") in ("CRITICAL", "NORMAL"):
                context["criticality"] = item["criticality"]
            values = dict(skill_id=mapping, raw_term=term, active=True, latest_revision_id=revision.id,
                          latest_revision_number=revision.revision_number, provenance=provenance,
                          normalization_status=item["normalizationStatus"], confidence=_confidence(item.get("confidence")),
                          evidence_refs=refs, safe_context=context, last_seen=observed_at)
            if occurrence is None:
                occurrence = SkillSourceOccurrence(identity_hash=identity, source_kind=kind,
                    source_version_id=version_id, normalized_term=_key(term), field_role=role,
                    first_revision_id=revision.id, first_seen=observed_at, **values)
                session.add(occurrence)
                by_identity[identity] = occurrence
            else:
                values["last_seen"] = max(_time(occurrence.last_seen), observed_at)
                for name, value in values.items():
                    setattr(occurrence, name, value)
            session.flush()
            link = session.get(SkillOccurrenceRevision, (occurrence.id, revision.id))
            if link is None:
                link = SkillOccurrenceRevision(occurrence_id=occurrence.id, revision_id=revision.id,
                    revision_number=revision.revision_number, observed_at=observed_at)
                session.add(link)
            link.observed_canonical_skill_id = observed_id
            link.normalization_status = item["normalizationStatus"]
            link.provenance, link.confidence = provenance, values["confidence"]
            link.evidence_refs, link.safe_context = refs, context
            link.taxonomy_version = document.get("taxonomyVersion")
            link.parser_version = document.get("parserVersion")
            link.correlation_id = link.correlation_id or correlation_id
            recorded.add(identity)
    session.flush()
    if skipped_capacity:
        LOGGER.warning("Skill recording coverage limited code=SKILL_CATALOG_LIMIT kind=%s recorded=%s skipped=%s",
                       kind, len(recorded), len(skipped_capacity))
    return RecordingResult(len(recorded), len(skipped_capacity))


def redirect_merged_occurrences(session: Session, source_id: int, target_id: int) -> None:
    # Parsed inputs and observed canonical IDs retain the version actually used.
    session.execute(update(SkillSourceOccurrence).where(SkillSourceOccurrence.skill_id == source_id).values(skill_id=target_id))


def erase_source_occurrences(session: Session, kind: SourceKind, version_id: int) -> None:
    identities = select(SkillSourceOccurrence.id).where(SkillSourceOccurrence.source_kind == kind,
                                                       SkillSourceOccurrence.source_version_id == version_id)
    session.execute(delete(SkillOccurrenceRevision).where(SkillOccurrenceRevision.occurrence_id.in_(identities)))
    session.execute(delete(SkillSourceOccurrence).where(SkillSourceOccurrence.source_kind == kind,
                                                       SkillSourceOccurrence.source_version_id == version_id))


def _eligible(source_kind: SourceKind | None = None):
    condition = SkillSourceOccurrence.active.is_(True) & ~exists(select(PrivacyTombstone.resource_id).where(
        PrivacyTombstone.kind == SkillSourceOccurrence.source_kind,
        PrivacyTombstone.resource_id == SkillSourceOccurrence.source_version_id))
    return condition if source_kind is None else condition & (SkillSourceOccurrence.source_kind == source_kind)


def _stats_query(skill_ids: list[int], source_kind: SourceKind | None = None):
    source_identity = SkillSourceOccurrence.source_kind + ":" + cast(SkillSourceOccurrence.source_version_id, String)
    return select(SkillSourceOccurrence.skill_id.label("skill_id"), func.count().label("occurrence_count"),
                  func.count(func.distinct(source_identity)).label("source_count"),
                  func.min(SkillSourceOccurrence.first_seen).label("first_seen"),
                  func.max(SkillSourceOccurrence.last_seen).label("last_seen")).where(
                  SkillSourceOccurrence.skill_id.in_(skill_ids), _eligible(source_kind)).group_by(SkillSourceOccurrence.skill_id)


def _stats(row) -> dict:
    return {"occurrenceCount": row.occurrence_count if row is not None else 0,
            "sourceCount": row.source_count if row is not None else 0,
            "firstSeen": _time(row.first_seen) if row is not None and row.first_seen is not None else None,
            "lastSeen": _time(row.last_seen) if row is not None and row.last_seen is not None else None}


def queue(session: Session, *, page: int, size: int, status: QueueStatus, source_kind: SourceKind | None = None,
          category: str | None = None, skill_type: str | None = None, q: str | None = None,
          sort: QueueSort = "OCCURRENCES_DESC") -> dict:
    catalog = head(session)
    ids = [parse_id(entry["stableId"]) for entry in catalog.skills if entry["status"] == status
           and _safe_term(entry["canonicalName"]) is not None
           and (category is None or compatible_skill(entry)["category"] == category)
           and (skill_type is None or compatible_skill(entry)["type"] == skill_type)
           and (not q or _key(q) in _key(entry["canonicalName"]))]
    result = {"catalogVersion": catalog.version, "taxonomyVersion": f"1.0.{catalog.published_version}",
              "page": page, "size": size, "totalElements": 0, "items": [], "catalogCapacity": {
                  "limit": CATALOG_LIMIT, "used": len(catalog.skills), "reached": len(catalog.skills) >= CATALOG_LIMIT,
                  "unmappedTermsMayBeSkipped": len(catalog.skills) >= CATALOG_LIMIT}}
    if not ids:
        return result
    # Expand the bounded catalog in SQL, then aggregate/page the ledger without
    # loading source payloads. Both supported DB dialects provide JSON expansion.
    sqlite = session.get_bind().dialect.name == "sqlite"
    expand = (func.json_each if sqlite else func.json_array_elements)(type(catalog).skills).table_valued("value")

    def field(name):
        return func.json_extract(expand.c.value, "$." + name) if sqlite else expand.c.value.op("->>")(name)

    stable_id, skill_type_field, category_field = field("stableId"), field("type"), field("category")
    definition_query = select(stable_id.label("skill_id"), field("canonicalName").label("name"), field("status").label("status"),
        case((skill_type_field == "tool", "other"), else_=skill_type_field).label("type"),
        case((category_field == "other", "cross_functional"), else_=category_field).label("category"))
    definitions = definition_query.select_from(type(catalog)).join(expand, true()).where(
        type(catalog).id == 1, stable_id.in_([str(identity) for identity in ids])).cte("queue_definitions")
    stats = _stats_query(ids, source_kind).cte("queue_stats")
    key = func.replace(definitions.c.skill_id, "-", "") if sqlite else definitions.c.skill_id
    rows = select(definitions, func.coalesce(stats.c.occurrence_count, 0).label("occurrence_count"),
                  func.coalesce(stats.c.source_count, 0).label("source_count"), stats.c.first_seen, stats.c.last_seen)
    rows = rows.select_from(definitions.outerjoin(stats, cast(stats.c.skill_id, String) == key))
    if source_kind is not None:
        rows = rows.where(stats.c.source_count > 0)
    result["totalElements"] = session.execute(select(func.count()).select_from(rows.subquery())).scalar_one()
    order = (stats.c.last_seen.desc().nulls_last() if sort == "LAST_SEEN_DESC" else
             stats.c.first_seen.asc().nulls_last() if sort == "FIRST_SEEN_ASC" else
             func.coalesce(stats.c.occurrence_count, 0).desc())
    result["items"] = [{"skillId": row.skill_id, "name": row.name, "status": row.status, "type": row.type,
                        "category": row.category, **_stats(row)} for row in session.execute(
                        rows.order_by(order, definitions.c.skill_id).offset(page * size).limit(size))]
    return result


def detail(session: Session, skill_id: int) -> dict:
    catalog = head(session)
    skill = next((entry for entry in catalog.skills if entry["stableId"] == str(skill_id)), None)
    if skill is None or _safe_term(skill["canonicalName"]) is None:
        raise ApiContractError(404, "SKILL_NOT_FOUND", "Skill was not found")
    stats = session.execute(_stats_query([skill_id])).first()
    return {"catalogVersion": catalog.version, "taxonomyVersion": f"1.0.{catalog.published_version}",
            "skill": catalog_projection(skill), **_stats(stats)}


def source_page(session: Session, skill_id: int, *, page: int, size: int, source_kind: SourceKind | None = None) -> dict:
    detail(session, skill_id)
    query = select(SkillSourceOccurrence).where(SkillSourceOccurrence.skill_id == skill_id, _eligible(source_kind))
    count = session.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    rows = session.scalars(query.order_by(SkillSourceOccurrence.last_seen.desc(), SkillSourceOccurrence.id)
                           .offset(page * size).limit(size)).all()
    return {"page": page, "size": size, "totalElements": count, "items": [{
        "occurrenceId": row.id, "sourceKind": row.source_kind, "sourceVersionId": row.source_version_id,
        "firstRevisionId": row.first_revision_id, "latestRevisionId": row.latest_revision_id,
        "fieldRole": row.field_role, "rawTerm": row.raw_term, "provenance": row.provenance,
        "normalizationStatus": row.normalization_status, "confidence": row.confidence,
        "evidenceRefs": row.evidence_refs, "context": row.safe_context,
        "firstSeen": _time(row.first_seen), "lastSeen": _time(row.last_seen)} for row in rows]}
