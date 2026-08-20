from typing import Protocol
from uuid import UUID

from app.task.domain import ProcessingTask


class ProcessingTaskRepository(Protocol):
    def find_by_public_id(self, task_id: UUID) -> ProcessingTask | None:
        ...

    def find_by_resource_id(self, resource_id: UUID) -> ProcessingTask | None:
        ...

    def start_cv(self, resource_id: UUID, owner_user_id: UUID,
                 object_ref: str, source_hash: str) -> ProcessingTask:
        ...

    def complete(self, task_id: UUID, result_payload: dict[str, object]) -> ProcessingTask:
        ...

    def fail(self, task_id: UUID, safe_error_code: str) -> ProcessingTask:
        ...


class ProcessingTaskNotFoundError(RuntimeError):
    pass


class GetProcessingTaskService:
    def __init__(self, tasks: ProcessingTaskRepository):
        self._tasks = tasks

    def execute(self, task_id: UUID) -> ProcessingTask:
        task = self._tasks.find_by_public_id(task_id)
        if task is None:
            raise ProcessingTaskNotFoundError("AI processing task was not found")
        return task
