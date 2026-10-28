"""Bounded, AI-owned catalog audit reads; never modify historical snapshots."""
from datetime import UTC, datetime
from typing import Literal, get_args
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.shared.api import ApiContractError
from app.shared.extraction_privacy import redact_contacts
from app.taxonomy.catalog import SkillCatalogHistory
from app.taxonomy.definitions import compatible_skill
from app.taxonomy.normalizer import _key


AuditAction = Literal["CREATE", "PROPOSE", "EDIT", "APPROVE", "MERGE", "REJECT", "DEFER", "REOPEN"]
_CONTACT_FIELDS = frozenset({"canonicalName", "normalizedName", "value", "normalized"})


def _mask_contact(value: str) -> str:
    masked = redact_contacts(value)
    normalized = _key(masked)
    if redact_contacts(normalized) != normalized:
        return "".join(char if char in "\r\n" else "█" for char in value)
    return masked


def _mask_state(value: object) -> object:
    if isinstance(value, dict):
        return {key: _mask_contact(item) if key in _CONTACT_FIELDS and isinstance(item, str)
                else _mask_state(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_mask_state(item) for item in value]
    return value


def catalog_projection(skill: dict) -> dict:
    original = compatible_skill(skill)
    projected = _mask_state(original)
    if not isinstance(projected, dict):
        raise RuntimeError("Skill catalog projection is invalid")
    if projected != original:
        projected["redacted"] = True
    return projected


def history_entry(row: SkillCatalogHistory) -> dict:
    before, after = _mask_state(row.before_state), _mask_state(row.after_state)
    reason = _mask_contact(row.reason) if row.reason is not None else None
    return {"id": row.id, "resourceId": row.skill_id, "actorId": row.actor_id, "action": row.action,
            "version": row.catalog_version, "before": before, "after": after,
            "createdAt": row.created_at.replace(tzinfo=UTC) if row.created_at.tzinfo is None else row.created_at,
            "reason": reason, "correlationId": row.correlation_id,
            "redacted": before != row.before_state or after != row.after_state or reason != row.reason}


def search_history(session: Session, *, page: int = 0, size: int = 20,
                   actor_id: int | None = None, resource_id: int | None = None,
                   action: AuditAction | None = None, correlation_id: UUID | None = None,
                   from_time: datetime | None = None, to_time: datetime | None = None) -> dict:
    if not 0 <= page <= 100000 or not 1 <= size <= 100 or (action is not None and action not in get_args(AuditAction)):
        raise ApiContractError(422, "SKILL_AUDIT_FILTER_INVALID", "Invalid audit filter or pagination")
    if any(value is not None and value.tzinfo is None for value in (from_time, to_time)):
        raise ApiContractError(422, "SKILL_AUDIT_FILTER_INVALID", "Audit timestamps require a timezone offset")
    if from_time is not None and to_time is not None and from_time > to_time:
        raise ApiContractError(422, "SKILL_AUDIT_FILTER_INVALID", "Audit start must not exceed its end")
    query = select(SkillCatalogHistory)
    for field, value in [(SkillCatalogHistory.actor_id, actor_id), (SkillCatalogHistory.skill_id, resource_id),
                         (SkillCatalogHistory.action, action), (SkillCatalogHistory.correlation_id, correlation_id)]:
        if value is not None:
            query = query.where(field == value)
    if from_time is not None:
        query = query.where(SkillCatalogHistory.created_at >= from_time.astimezone(UTC))
    if to_time is not None:
        query = query.where(SkillCatalogHistory.created_at <= to_time.astimezone(UTC))
    total = session.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    rows = session.scalars(query.order_by(SkillCatalogHistory.created_at.desc(), SkillCatalogHistory.id.desc())
                           .offset(page * size).limit(size)).all()
    return {"items": [history_entry(row) for row in rows], "total": total, "page": page, "size": size}
