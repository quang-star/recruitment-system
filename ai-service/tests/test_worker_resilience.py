from types import SimpleNamespace
from uuid import UUID

from app.worker import _dead_letter_event, _job_processing_event, _matching_event


def test_dead_letter_event_is_replayable_without_exposing_error_message() -> None:
    envelope = {
        "eventId": "2c02d7a7-df23-4b93-9252-329a4805c410",
        "eventType": "application.submitted.v1",
        "correlationId": "ad859abb-886a-4db1-80c5-631c03665332",
        "payload": {"applicationId": "4a9bd868-3e5a-4a6d-b76d-876b83d89055"},
    }
    message = SimpleNamespace(topic="application.submitted.v1", partition=2, offset=17)

    event = _dead_letter_event(envelope, message, RuntimeError("private detail"), 3)

    UUID(event["eventId"])
    assert event["eventType"] == "ai.processing.dead-lettered.v1"
    assert event["correlationId"] == envelope["correlationId"]
    assert event["payload"] == {
        "sourceTopic": "application.submitted.v1",
        "sourcePartition": 2,
        "sourceOffset": 17,
        "attempts": 3,
        "errorType": "RuntimeError",
        "originalEnvelope": envelope,
    }
    assert "private detail" not in str(event)


def test_job_processing_event_contains_only_safe_projection_fields() -> None:
    envelope = {"correlationId": "ad859abb-886a-4db1-80c5-631c03665332"}
    job_id = UUID("779494ac-c858-4570-a884-6e88423b8e2b")
    version_id = UUID("879494ac-c858-4570-a884-6e88423b8e2b")
    task_id = UUID("979494ac-c858-4570-a884-6e88423b8e2b")
    event = _job_processing_event(envelope, task_id, "PARSED", "a" * 64,
                                  job_id, version_id, None)

    assert event["eventType"] == "job.processing.updated.v1"
    assert event["payload"] == {
        "jobId": str(job_id), "jobVersionId": str(version_id),
        "processingTaskId": str(task_id), "sourceHash": "a" * 64,
        "status": "PARSED", "failureCode": None,
    }


def test_matching_event_idempotency_changes_with_algorithm_and_taxonomy_version() -> None:
    envelope = {"correlationId": "ad859abb-886a-4db1-80c5-631c03665332"}
    result = SimpleNamespace(
        public_id=UUID("679494ac-c858-4570-a884-6e88423b8e2b"),
        status="COMPLETED", final_score=80.0, quality_flags=[], components=[], claims=[],
        algorithm_version="baseline-v2", taxonomy_version="1.0.0",
    )

    event = _matching_event(
        envelope, result,
        UUID("779494ac-c858-4570-a884-6e88423b8e2b"),
        UUID("879494ac-c858-4570-a884-6e88423b8e2b"),
        UUID("979494ac-c858-4570-a884-6e88423b8e2b"),
    )

    assert event["idempotencyKey"].endswith(":baseline-v2:1.0.0")
    assert event["payload"]["algorithmVersion"] == "baseline-v2"
    assert event["payload"]["taxonomyVersion"] == "1.0.0"
