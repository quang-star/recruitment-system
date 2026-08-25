from types import SimpleNamespace
from uuid import UUID

from app.worker import _dead_letter_event


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
