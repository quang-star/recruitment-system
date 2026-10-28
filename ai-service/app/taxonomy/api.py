from app.shared.api_ids import BusinessId
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.shared.api import ApiContractError
from app.shared.database import get_session
from app.shared.config import Settings, get_settings
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.catalog import head, change, SkillCatalogHistory, snapshot
from app.taxonomy.audit import AuditAction, catalog_projection, history_entry, search_history
from app.taxonomy.candidates import suggest_skills
from app.taxonomy.definitions import SkillCategory, SkillType, SkillRelation
from app.taxonomy.occurrences import (QueueSort, QueueStatus, SourceKind, detail as occurrence_detail,
                                     queue, source_page)

router = APIRouter(prefix="/api/v2/taxonomy", tags=["taxonomy"])


def require_admin(principal: AuthenticatedPrincipal = Depends(require_access_token)):
    if "SYSTEM_ADMIN" not in principal.roles:
        raise ApiContractError(403, "ADMIN_ROLE_REQUIRED", "Admin role is required")
    return principal


class SkillAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0)
    action: Literal["CREATE", "EDIT", "APPROVE", "REJECT", "MERGE", "DEFER", "REOPEN"]
    reason: str = Field(min_length=1, max_length=1000)
    skillId: BusinessId | None = None
    name: str | None = Field(default=None, max_length=240)
    aliases: list[str] | None = Field(default=None, max_length=50)
    mergeTargetId: BusinessId | None = None
    type: SkillType | None = None
    category: SkillCategory | None = None
    relations: list[SkillRelation] | None = Field(default=None, max_length=100)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A reason is required")
        return value.strip()


@router.get("/skills")
def list_skills(principal=Depends(require_admin), session: Session = Depends(get_session)):
    value = head(session)
    return {"version": value.version, "taxonomyVersion": f"1.0.{value.published_version}",
            "skills": [catalog_projection(skill) for skill in value.skills]}


@router.post("/skills")
def act(body: SkillAction, request: Request, principal=Depends(require_admin), session: Session = Depends(get_session)):
    result = change(session, principal.subject, body.version, action=body.action, skill_id=body.skillId,
                    name=body.name, aliases=body.aliases, merge_target_id=body.mergeTargetId,
                    reason=body.reason, correlation_id=request.state.correlation_id,
                    skill_type=body.type, category=body.category,
                    relations=None if body.relations is None else [value.model_dump(mode="json") for value in body.relations])
    session.commit()
    return result


@router.get("/skills/{skill_id}/history")
def history(skill_id: BusinessId, principal=Depends(require_admin), session: Session = Depends(get_session)):
    rows = session.scalars(select(SkillCatalogHistory).where(SkillCatalogHistory.skill_id == skill_id)
                           .order_by(SkillCatalogHistory.created_at.desc()).limit(100)).all()
    return [history_entry(row) for row in rows]


@router.get("/skills/history")
def audit_history(page: int = Query(default=0, ge=0, le=100000), size: int = Query(default=20, ge=1, le=100),
                  actor_id: BusinessId | None = Query(default=None, alias="actorId"),
                  resource_id: BusinessId | None = Query(default=None, alias="resourceId"),
                  action: AuditAction | None = None,
                  correlation_id: UUID | None = Query(default=None, alias="correlationId"),
                  from_time: datetime | None = Query(default=None, alias="from"),
                  to_time: datetime | None = Query(default=None, alias="to"),
                  principal=Depends(require_admin), session: Session = Depends(get_session)):
    return search_history(session, page=page, size=size, actor_id=actor_id, resource_id=resource_id,
                          action=action, correlation_id=correlation_id, from_time=from_time, to_time=to_time)


@router.get("/pending-skills")
def pending_skills(page: int = Query(default=0, ge=0, le=100000), size: int = Query(default=20, ge=1, le=100),
                   status: QueueStatus = Query(default="PENDING"),
                   source_kind: SourceKind | None = Query(default=None, alias="sourceKind"),
                   category: SkillCategory | None = None,
                   skill_type: SkillType | None = Query(default=None, alias="type"),
                   q: str | None = Query(default=None, max_length=120),
                   sort: QueueSort = Query(default="OCCURRENCES_DESC"),
                   principal=Depends(require_admin), session: Session = Depends(get_session)):
    return queue(session, page=page, size=size, status=status, source_kind=source_kind,
                 category=category, skill_type=skill_type, q=q, sort=sort)


@router.get("/pending-skills/{skill_id}")
def pending_skill_detail(skill_id: BusinessId, principal=Depends(require_admin), session: Session = Depends(get_session)):
    return occurrence_detail(session, skill_id)


@router.get("/pending-skills/{skill_id}/occurrences")
def pending_skill_sources(skill_id: BusinessId, page: int = Query(default=0, ge=0, le=100000),
                         size: int = Query(default=20, ge=1, le=100),
                         source_kind: SourceKind | None = Query(default=None, alias="sourceKind"),
                         principal=Depends(require_admin), session: Session = Depends(get_session)):
    return source_page(session, skill_id, page=page, size=size, source_kind=source_kind)


@router.get("/pending-skills/{skill_id}/candidates")
def pending_skill_candidates(skill_id: BusinessId, limit: int = Query(default=5, ge=1, le=20),
                             semantic: bool = False, principal=Depends(require_admin),
                             session: Session = Depends(get_session), settings: Settings = Depends(get_settings)):
    proposal = occurrence_detail(session, skill_id)
    return suggest_skills(proposal["skill"]["canonicalName"], snapshot(session), limit=limit,
                          semantic=semantic, cache_directory=settings.semantic_cache_directory,
                          max_chars=settings.semantic_max_input_chars).response()
