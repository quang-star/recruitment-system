from typing import Protocol

from app.task.domain import ProcessingTask, TaskType


class ProcessingTaskRepository(Protocol):
    def find_by_id(self, task_id: int) -> ProcessingTask | None:
        ...

    def find_by_resource_id(self, resource_id: int, task_type: TaskType = TaskType.PARSE_CV) -> ProcessingTask | None:
        ...

    def start_cv(self, resource_id: int, owner_user_id: int,
                 object_ref: str, source_hash: str) -> ProcessingTask:
        ...

    def complete(self, task_id: int, result_payload: dict[str, object]) -> ProcessingTask:
        ...

    def fail(self, task_id: int, safe_error_code: str) -> ProcessingTask:
        ...


class ProcessingTaskNotFoundError(RuntimeError):
    pass


class GetProcessingTaskService:
    def __init__(self, tasks: ProcessingTaskRepository):
        self._tasks = tasks

    def execute(self, task_id: int) -> ProcessingTask:
        task = self._tasks.find_by_id(task_id)
        if task is None:
            raise ProcessingTaskNotFoundError("AI processing task was not found")
        return task
