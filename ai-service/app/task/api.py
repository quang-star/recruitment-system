from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.shared.api import ApiContractError
from app.shared.database import get_session
from app.shared.security import require_access_token
from app.task.application import GetProcessingTaskService, ProcessingTaskNotFoundError
from app.task.domain import ProcessingTask, TaskState, TaskType
from app.task.persistence import SqlAlchemyProcessingTaskRepository

router = APIRouter(
    prefix="/api/v1/ai-tasks",
    tags=["ai-tasks"],
    dependencies=[Depends(require_access_token)],
)


class ProcessingTaskResponse(BaseModel):
    taskId: UUID
    type: TaskType
    state: TaskState
    attempt: int
    safeErrorCode: str | None
    submittedAt: datetime
    updatedAt: datetime

    @classmethod
    def from_domain(cls, task: ProcessingTask) -> "ProcessingTaskResponse":
        return cls(
            taskId=task.public_id,
            type=task.task_type,
            state=task.state,
            attempt=task.attempt_count,
            safeErrorCode=task.safe_error_code,
            submittedAt=task.submitted_at,
            updatedAt=task.updated_at,
        )


@router.get("/{task_id}", response_model=ProcessingTaskResponse)
def get_task(task_id: UUID, session: Session = Depends(get_session)) -> ProcessingTaskResponse:
    service = GetProcessingTaskService(SqlAlchemyProcessingTaskRepository(session))
    try:
        return ProcessingTaskResponse.from_domain(service.execute(task_id))
    except ProcessingTaskNotFoundError as exception:
        raise ApiContractError(404, "AI_TASK_NOT_FOUND", str(exception)) from exception
