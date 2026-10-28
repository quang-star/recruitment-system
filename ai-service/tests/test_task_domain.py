from identity_fixtures import new_id
from datetime import UTC, datetime

import pytest

from app.task.domain import ProcessingTask, TaskState, TaskType


def test_failed_task_requires_safe_error_code() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValueError):
        ProcessingTask(new_id(), TaskType.PARSE_CV, TaskState.FAILED, 1, now, now)


def test_completed_task_does_not_expose_error() -> None:
    now = datetime.now(UTC)
    task = ProcessingTask(new_id(), TaskType.MATCH_APPLICATION, TaskState.COMPLETED, 1, now, now)
    assert task.safe_error_code is None
