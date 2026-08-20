from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.task.application import GetProcessingTaskService, ProcessingTaskNotFoundError
from app.task.domain import ProcessingTask, TaskState, TaskType


class FakeTasks:
    def __init__(self, task: ProcessingTask | None):
        self.task = task

    def find_by_public_id(self, task_id):
        return self.task if self.task and self.task.public_id == task_id else None


def test_returns_task_from_port() -> None:
    now = datetime.now(UTC)
    task = ProcessingTask(uuid4(), TaskType.PARSE_JD, TaskState.QUEUED, 0, now, now)
    assert GetProcessingTaskService(FakeTasks(task)).execute(task.public_id) == task


def test_raises_when_task_is_missing() -> None:
    with pytest.raises(ProcessingTaskNotFoundError):
        GetProcessingTaskService(FakeTasks(None)).execute(uuid4())
