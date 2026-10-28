"""Published catalog snapshots are immutable for the duration of a parse/review."""
from app.shared.identities import JOB_SKILL_ID_MIN, parse_id
from app.shared.database import BUSINESS_ID
from copy import deepcopy
from datetime import UTC, datetime
import json
import hashlib
from functools import lru_cache
from typing import get_args
from uuid import UUID

from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from sqlalchemy import Integer, JSON, DateTime, String, Uuid, select, text, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base
from app.shared.api import ApiContractError
from app.shared.extraction_privacy import redact_contacts
from app.taxonomy.normalizer import _key, _taxonomy_path, build_taxonomy
from app.taxonomy.definitions import SkillCategory, SkillType, SkillRelation, compatible_skill, normalized_name

CATALOG_LIMIT = 1000


class TaxonomyVersionRecord(Base):
    __tablename__ = "taxonomy_versions"
    semantic_version: Mapped[str] = mapped_column(String(32), primary_key=True)
    schema_version: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    language_scope: Mapped[list] = mapped_column(JSON, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON)


def publish_version(session: Session, skills: list, number: int) -> None:
    version = f"1.0.{number}"
    published_skills = _published_skills(skills)
    _validate_aliases(published_skills)
    payload = {"schemaVersion": "skill-taxonomy/2.0", "semanticVersion": version, "status": "PUBLISHED",
               "languageScope": ["vi", "en"], "skills": published_skills}
    try:
        _taxonomy_contract().validate(payload)
    except ValidationError as exception:
        raise ApiContractError(422, "SKILL_DEFINITION_INVALID", "Published skill definition is invalid") from exception
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    existing = session.get(TaxonomyVersionRecord, version)
    if existing is not None:
        if existing.source_hash != digest:
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Published taxonomy version already has another definition")
        return
    session.add(TaxonomyVersionRecord(semantic_version=version, schema_version="skill-taxonomy/2.0", status="ACTIVE",
                language_scope=["vi", "en"], source_hash=digest, created_at=datetime.now(UTC), payload=payload))
    session.flush()


@lru_cache(maxsize=1)
def _taxonomy_contract() -> Draft202012Validator:
    path = _taxonomy_path().parent.parent / "schemas" / "skill-taxonomy-v2.schema.json"
    return Draft202012Validator(json.loads(path.read_text(encoding="utf-8")), format_checker=FormatChecker())


def _published_skills(skills: list) -> list:
    return [compatible_skill(deepcopy(skill)) for skill in skills if skill["status"] == "ACTIVE"]


class SkillCatalogRecord(Base):
    __tablename__ = "skill_catalog"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    published_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skills: Mapped[list] = mapped_column(JSON, nullable=False)


class SkillCatalogHistory(Base):
    __tablename__ = "skill_catalog_history"
    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    skill_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    actor_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    catalog_version: Mapped[int] = mapped_column(Integer, nullable=False)
    before_state: Mapped[dict | None] = mapped_column(JSON)
    after_state: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(1000))
    correlation_id: Mapped[UUID | None] = mapped_column(Uuid)


def seed_skills() -> list:
    return json.loads(_taxonomy_path(2).read_text(encoding="utf-8"))["skills"]


def head(session: Session, *, lock=False) -> SkillCatalogRecord:
    query = select(SkillCatalogRecord).where(SkillCatalogRecord.id == 1)
    if lock:
        query = query.with_for_update()
    value = session.scalar(query.execution_options(populate_existing=True))
    if value is None:
        # Migrations always create this row; tests may seed it explicitly.
        raise RuntimeError("Published skill catalog is unavailable")
    return value


def snapshot(session: Session):
    value = head(session)
    published = session.get(TaxonomyVersionRecord, f"1.0.{value.published_version}")
    if published is not None and published.payload is not None:
        return build_taxonomy(published.payload)
    # Tests may initialize only the catalog; legacy migrations may have no payload.
    return build_taxonomy({"semanticVersion": f"1.0.{value.published_version}",
                           "skills": [skill for skill in value.skills if skill["status"] == "ACTIVE"]})


def _next_skill_id(session: Session, skills: list) -> int:
    allocated = max((parse_id(item["stableId"]) for item in skills), default=0)
    if session.get_bind().dialect.name == "postgresql":
        # Migration also assigns IDs to historical job claims absent from the
        # live catalog. The locked catalog head must respect those reservations.
        reserved = session.execute(text("SELECT COALESCE(MAX(entity_id),0) FROM legacy_identity_map WHERE service='ai' AND entity_type='skill'")).scalar_one()
        allocated = max(allocated, int(reserved))
    identity = allocated + 1
    if identity >= JOB_SKILL_ID_MIN:
        raise ApiContractError(409, "SKILL_ID_RANGE_EXHAUSTED", "Canonical skill identity range is exhausted")
    return identity


def _clean_name(value: str) -> str:
    name = " ".join(value.split()).strip()
    if not name or len(name) > 240:
        raise ApiContractError(422, "SKILL_NAME_INVALID", "Skill name must contain 1–240 characters")
    normalized = _key(name)
    if "█" in name or redact_contacts(name) != name or redact_contacts(normalized) != normalized:
        raise ApiContractError(422, "SKILL_NAME_INVALID", "Use a skill name without contact details or masked text")
    return name


def _validate_aliases(skills: list) -> None:
    owners: dict[str, str] = {}
    for skill in skills:
        if skill["status"] not in ("ACTIVE", "PENDING", "DEFERRED"):
            continue
        terms = [skill["canonicalName"], skill["normalizedName"]]
        terms += [term for alias in skill.get("aliases", []) for term in (alias["value"], alias["normalized"])]
        for term in terms:
            key = _key(term)
            if key in owners and owners[key] != skill["stableId"]:
                raise ApiContractError(409, "SKILL_ALIAS_CONFLICT", "Skill name or alias is already used")
            owners[key] = skill["stableId"]


def _clean_reason(value: str | None) -> str:
    reason = (value or "").strip()
    if not reason or len(reason) > 1000:
        raise ApiContractError(422, "SKILL_REASON_REQUIRED", "A reason of 1–1000 characters is required")
    return reason


def _edit_definition(entry: dict, name: str | None, aliases: list[str] | None,
                     skill_type: SkillType | None, category: SkillCategory | None,
                     relations: list[dict] | None) -> None:
    if name is not None:
        entry["canonicalName"] = _clean_name(name)
        entry["normalizedName"] = normalized_name(entry["canonicalName"])
    if aliases is not None:
        if len(aliases) > 50:
            raise ApiContractError(422, "SKILL_ALIASES_INVALID", "At most 50 aliases are allowed")
        entry["aliases"] = [{"value": _clean_name(alias), "normalized": _key(_clean_name(alias)),
                              "language": "neutral"} for alias in aliases]
    if skill_type is not None:
        if skill_type not in get_args(SkillType):
            raise ApiContractError(422, "SKILL_TYPE_INVALID", "Skill type is invalid")
        entry["type"] = skill_type
    if category is not None:
        if category not in get_args(SkillCategory):
            raise ApiContractError(422, "SKILL_CATEGORY_INVALID", "Skill category is invalid")
        entry["category"] = category
    if relations is not None:
        if len(relations) > 100:
            raise ApiContractError(422, "SKILL_RELATION_INVALID", "At most 100 relations are allowed")
        try:
            entry["relations"] = [SkillRelation.model_validate(relation).model_dump(mode="json") for relation in relations]
        except ValueError as exception:
            raise ApiContractError(422, "SKILL_RELATION_INVALID", "Skill relation is invalid") from exception


def _acyclic(edges: dict[str, set[str]]) -> None:
    nodes = set(edges) | {target for targets in edges.values() for target in targets}
    incoming = {node: 0 for node in nodes}
    for targets in edges.values():
        for target in targets:
            incoming[target] += 1
    ready = [node for node, count in incoming.items() if count == 0]
    visited = 0
    while ready:
        node = ready.pop()
        visited += 1
        for target in edges.get(node, set()):
            incoming[target] -= 1
            if incoming[target] == 0:
                ready.append(target)
    if visited != len(nodes):
        raise ApiContractError(422, "SKILL_RELATION_CYCLE", "Skill relation creates a cycle")


def _validate_relations(skills: list) -> None:
    active_ids = {skill["stableId"] for skill in skills if skill["status"] == "ACTIVE"}
    hierarchy: dict[str, set[str]] = {}
    supersedes: dict[str, set[str]] = {}
    for skill in skills:
        if skill["status"] not in ("ACTIVE", "PENDING", "DEFERRED"):
            continue
        source = skill["stableId"]
        seen: set[tuple[str, str]] = set()
        for relation in skill.get("relations", []):
            kind, target = relation["type"], relation["targetSkillId"]
            identity = kind, target
            if target == source or target not in active_ids or identity in seen:
                raise ApiContractError(422, "SKILL_RELATION_INVALID", "Choose another active skill once per relation type")
            seen.add(identity)
            if skill["status"] != "ACTIVE":
                continue
            if kind in ("BROADER", "NARROWER"):
                left, right = (source, target) if kind == "BROADER" else (target, source)
                hierarchy.setdefault(left, set()).add(right)
            elif kind == "SUPERSEDES":
                supersedes.setdefault(source, set()).add(target)
    _acyclic(hierarchy)
    _acyclic(supersedes)


def _merge(skills: list, entry: dict, target_id: int | None) -> dict:
    target = next((item for item in skills if item["stableId"] == str(target_id)), None)
    if not target or target is entry or target["status"] != "ACTIVE":
        raise ApiContractError(422, "SKILL_MERGE_INVALID", "Choose another active skill")
    target["aliases"] += deepcopy(entry.get("aliases", [])) + [
        {"value": entry["canonicalName"], "normalized": entry["normalizedName"], "language": "neutral"}]
    target["relations"] += deepcopy(entry.get("relations", []))
    entry["status"], entry["mergedIntoId"] = "MERGED", target["stableId"]
    for skill in skills:
        if skill["status"] not in ("ACTIVE", "PENDING", "DEFERRED"):
            continue
        redirected = []
        seen: set[tuple[str, str]] = set()
        for relation in skill.get("relations", []):
            relation = dict(relation)
            if relation["targetSkillId"] == entry["stableId"]:
                relation["targetSkillId"] = target["stableId"]
                if skill is target:
                    continue  # A relation to the merged source no longer links distinct skills.
            identity = relation["type"], relation["targetSkillId"]
            if identity not in seen:
                redirected.append(relation)
                seen.add(identity)
        skill["relations"] = redirected
    return target


def change(session: Session, actor: int, expected_version: int, *, action: str,
           reason: str | None = None, correlation_id: UUID | None = None,
           skill_id: int | None = None, name: str | None = None,
           aliases: list[str] | None = None, merge_target_id: int | None = None,
           skill_type: SkillType | None = None, category: SkillCategory | None = None,
           relations: list[dict] | None = None) -> dict:
    clean_reason = _clean_reason(reason)
    if action not in ("CREATE", "PROPOSE", "EDIT", "APPROVE", "REJECT", "MERGE", "DEFER", "REOPEN"):
        raise ApiContractError(422, "SKILL_ACTION_INVALID", "Unsupported catalog action")
    editable = action in ("CREATE", "PROPOSE", "EDIT", "APPROVE")
    if not editable and any(value is not None for value in (name, aliases, skill_type, category, relations)):
        raise ApiContractError(422, "SKILL_ACTION_INVALID", "This review action cannot edit a skill definition")
    if action != "MERGE" and merge_target_id is not None:
        raise ApiContractError(422, "SKILL_ACTION_INVALID", "A merge target is only valid when merging")
    current = head(session, lock=True)
    if current.version != expected_version:
        raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Catalog changed; reload before retrying")
    skills = deepcopy(current.skills)
    entry = next((item for item in skills if item["stableId"] == str(skill_id)), None)
    before = deepcopy(entry)
    if action in ("CREATE", "PROPOSE"):
        if len(skills) >= CATALOG_LIMIT:
            raise ApiContractError(409, "SKILL_CATALOG_LIMIT", "Catalog limit reached")
        clean = _clean_name(name or "")
        # The catalog head is locked above; allocation is serialized with review.
        next_id = _next_skill_id(session, skills)
        entry = {"stableId": str(next_id), "canonicalName": clean, "normalizedName": normalized_name(clean),
                 "type": "other", "category": "cross_functional", "aliases": [], "relations": [],
                 "status": "PENDING" if action == "PROPOSE" else "ACTIVE"}
        skills.append(entry)
    elif entry is None or entry["status"] not in ("ACTIVE", "PENDING", "DEFERRED"):
        raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Skill is unavailable or already reviewed")
    elif action == "APPROVE":
        if entry["status"] != "PENDING":
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Only pending skills can be approved")
        entry["status"] = "ACTIVE"
    elif action == "REJECT":
        if entry["status"] != "PENDING":
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Only pending skills can be rejected")
        entry["status"] = "REJECTED"
    elif action == "DEFER":
        if entry["status"] != "PENDING":
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Only pending skills can be deferred")
        entry["status"] = "DEFERRED"
    elif action == "REOPEN":
        if entry["status"] != "DEFERRED":
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Only deferred skills can be reopened")
        entry["status"] = "PENDING"
    elif action == "MERGE":
        if entry["status"] == "DEFERRED":
            raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Reopen a deferred skill before reviewing")
        target = _merge(skills, entry, merge_target_id)
    elif action != "EDIT":
        raise ApiContractError(422, "SKILL_ACTION_INVALID", "Unsupported catalog action")
    elif entry["status"] == "DEFERRED":
        raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Reopen a deferred skill before editing")
    if editable:
        entry.update(compatible_skill(entry))
        _edit_definition(entry, name, aliases, skill_type, category, relations)
    for skill in skills:
        if skill["status"] == "ACTIVE" and (len(skill["canonicalName"]) > 160 or len(skill["normalizedName"]) > 160
                or any(len(alias["value"]) > 160 for alias in skill.get("aliases", []))):
            raise ApiContractError(422, "SKILL_NAME_INVALID", "Published skill names and aliases must not exceed 160 characters")
    _validate_aliases(skills)
    _validate_relations(skills)
    next_version = current.version + 1
    publish = _published_skills(skills) != _published_skills(current.skills)
    published_version = next_version if publish else current.published_version
    if publish:
        publish_version(session, skills, next_version)
    result = session.execute(update(SkillCatalogRecord).where(SkillCatalogRecord.id == 1,
                             SkillCatalogRecord.version == expected_version)
                             .values(version=next_version, published_version=published_version,
                                     skills=skills).execution_options(synchronize_session=False))
    if not isinstance(result, CursorResult) or result.rowcount != 1:
        raise ApiContractError(409, "SKILL_CATALOG_CONFLICT", "Catalog changed; reload before retrying")
    if action == "MERGE":
        from app.taxonomy.occurrences import redirect_merged_occurrences
        redirect_merged_occurrences(session, parse_id(entry["stableId"]), parse_id(target["stableId"]))
    # Capture every definition affected by a merge, including incoming relations.
    after = deepcopy(entry)
    if action == "MERGE":
        if before is None:
            raise RuntimeError("A merge requires an existing source definition")
        before = {**before, "target": deepcopy(next(skill for skill in current.skills
                                                    if skill["stableId"] == target["stableId"]))}
        after = {**after, "target": deepcopy(target)}
        changed_relations = [{"before": deepcopy(old), "after": deepcopy(new)}
                             for old, new in zip(current.skills, skills)
                             if old["stableId"] not in (entry["stableId"], target["stableId"])
                             and old.get("relations", []) != new.get("relations", [])]
        if changed_relations:
            after["relationChanges"] = changed_relations
    session.add(SkillCatalogHistory(skill_id=parse_id(entry["stableId"]), actor_id=actor,
                action=action, catalog_version=next_version, before_state=before, after_state=after,
                created_at=datetime.now(UTC), reason=clean_reason, correlation_id=correlation_id))
    session.flush()
    return {"version": next_version, "taxonomyVersion": f"1.0.{published_version}", "skill": compatible_skill(entry)}


def propose_from_jd(session: Session, actor: int, payload: dict, *, correlation_id: UUID | None = None) -> None:
    names = [skill["raw"] for group in ("requiredSkills", "preferredSkills")
             for skill in payload.get("requirements", {}).get(group, [])
             if skill.get("normalizationStatus") == "PENDING"]
    for name in names:
        current = head(session, lock=True)
        if any(_key(name) == _key(term) for entry in current.skills
               for term in [entry["canonicalName"]] + [a["value"] for a in entry.get("aliases", [])]):
            continue
        change(session, actor, current.version, action="PROPOSE", name=name,
               reason="Unknown skill extracted or reviewed in a JD", correlation_id=correlation_id)
