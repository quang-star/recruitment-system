from app.shared.database import BUSINESS_ID
from app.shared.api_ids import BusinessId
from datetime import datetime
from typing import Literal
from uuid import UUID
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database import Base
from app.shared.extraction_privacy import redact_contacts

Operation = Literal["PARSE_CV", "PARSE_JD", "MATCH_APPLICATION"]
TERMINAL_STATES = ("COMPLETED", "SKIPPED", "FAILED")


def safe_reason(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("A reason is required")
    masked = redact_contacts(value)
    # Check the remaining text after raw masking, so mixed ASCII/full-width
    # contacts cannot bypass the second pass.
    normalized = unicodedata.normalize("NFKC", masked)
    if redact_contacts(normalized) != normalized:
        return "[Contact details redacted]"
    return masked


class ImpactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Operation
    resourceIds: list[BusinessId] | None = Field(default=None, min_length=1, max_length=1000)
    taxonomyVersion: str | None = Field(default=None, max_length=32)
    asOfMonth: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @field_validator("resourceIds")
    @classmethod
    def unique_ids(cls, value: list[BusinessId] | None) -> list[int] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("resourceIds must be unique")
        return value


class CreateBatchRequest(ImpactRequest):
    reason: str = Field(min_length=1, max_length=1000)
    previewHash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return safe_reason(value)


class ControlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0)
    action: Literal["PAUSE", "RESUME"]
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return safe_reason(value)


class EligibilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Operation
    resourceId: BusinessId
    sourceOwnerId: BusinessId | None = None
    sourceHash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    cvVersionId: BusinessId | None = None
    jobVersionId: BusinessId | None = None


class EligibilityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eligible: bool = Field(strict=True)
    reasonCode: Literal["LIVE", "SOURCE_NOT_AVAILABLE", "SOURCE_CHANGED", "ACCESS_REVOKED", "OUTSIDE_IT"]


class ReprocessingBatch(Base):
    __tablename__ = "reprocessing_batches"
    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    actor_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    idempotency_key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    operation: Mapped[str] = mapped_column(String(30), nullable=False)
    target_config: Mapped[dict] = mapped_column(JSON, nullable=False)
    target_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checkpoint: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    planned_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (UniqueConstraint("actor_id", "idempotency_key_hash", name="uk_reprocessing_command"),)


class ReprocessingItem(Base):
    __tablename__ = "reprocessing_items"
    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    batch_id: Mapped[int] = mapped_column(BUSINESS_ID, ForeignKey("reprocessing_batches.id"), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    resource_id: Mapped[int | None] = mapped_column(BUSINESS_ID, index=True)
    cv_version_id: Mapped[int | None] = mapped_column(BUSINESS_ID, index=True)
    job_version_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    application_id: Mapped[int | None] = mapped_column(BUSINESS_ID, index=True)
    snapshot: Mapped[dict | None] = mapped_column(JSON)
    current_hash: Mapped[str | None] = mapped_column(String(64))
    effect_key: Mapped[str | None] = mapped_column(String(64))
    reasons: Mapped[list] = mapped_column(JSON, nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lease_token: Mapped[UUID | None] = mapped_column(Uuid)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    output_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    safe_error_code: Mapped[str | None] = mapped_column(String(80))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (UniqueConstraint("batch_id", "ordinal", name="uk_reprocessing_item_order"),)


class ReprocessingAttempt(Base):
    __tablename__ = "reprocessing_attempts"
    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    item_id: Mapped[int] = mapped_column(BUSINESS_ID, ForeignKey("reprocessing_items.id"), nullable=False, index=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[str | None] = mapped_column(String(20))
    safe_error_code: Mapped[str | None] = mapped_column(String(80))
    __table_args__ = (UniqueConstraint("item_id", "number", name="uk_reprocessing_attempt_number"),)


class ReprocessingAudit(Base):
    __tablename__ = "reprocessing_audit"
    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    batch_id: Mapped[int] = mapped_column(BUSINESS_ID, ForeignKey("reprocessing_batches.id"), nullable=False, index=True)
    actor_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
