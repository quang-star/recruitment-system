from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class TaskType(StrEnum):
    PARSE_CV = "PARSE_CV"
    PARSE_JD = "PARSE_JD"
    MATCH_APPLICATION = "MATCH_APPLICATION"
    REPROCESS = "REPROCESS"


class TaskState(StrEnum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    RETRYING = "RETRYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass(frozen=True, slots=True)
class ProcessingTask:
    public_id: UUID
    task_type: TaskType
    state: TaskState
    attempt_count: int
    submitted_at: datetime
    updated_at: datetime
    safe_error_code: str | None = None
    resource_id: UUID | None = None
    result_payload: dict[str, object] | None = None
    owner_user_id: UUID | None = None

    def __post_init__(self) -> None:
        if self.attempt_count < 0:
            raise ValueError("attempt_count must not be negative")
        if self.updated_at < self.submitted_at:
            raise ValueError("updated_at must not precede submitted_at")
        if self.state is TaskState.FAILED and not self.safe_error_code:
            raise ValueError("failed tasks require a safe error code")
        if self.state is not TaskState.FAILED and self.safe_error_code:
            raise ValueError("only failed tasks may expose a safe error code")
