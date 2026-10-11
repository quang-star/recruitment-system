from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.cv.api import ParsedCvResponse
from app.cv.repository import ParsedCvRevision
from app.jd.api import ParsedJdResponse
from app.jd.repository import ParsedJdRevision


def _response(document: str, status: str) -> ParsedCvResponse | ParsedJdResponse:
    if document == "cv":
        return ParsedCvResponse.from_revision(ParsedCvRevision(
            public_id=uuid4(), cv_version_id=uuid4(), owner_user_id=uuid4(),
            revision_number=2, source_hash="a" * 64, payload={}, status=status,
            confirmed_by=None, confirmed_at=None, version=0,
        ))
    return ParsedJdResponse.from_revision(ParsedJdRevision(
        public_id=uuid4(), job_id=uuid4(), job_version_id=uuid4(), owner_user_id=uuid4(),
        revision_number=2, source_hash="a" * 64, payload={}, status=status,
        confirmed_by=None, confirmed_at=None, version=0,
    ))


@pytest.mark.parametrize("document", ["cv", "jd"])
@pytest.mark.parametrize("status", ["PARSED", "CONFIRMED", "SUPERSEDED"])
def test_response_preserves_valid_persisted_revision_status(document: str, status: str) -> None:
    response = _response(document, status)

    assert response.status == status
    assert response.model_dump(mode="json")["status"] == status


@pytest.mark.parametrize("document", ["cv", "jd"])
def test_response_rejects_unknown_persisted_revision_status(document: str) -> None:
    with pytest.raises(ValidationError) as error:
        _response(document, "UNRECOGNIZED")

    assert error.value.errors()[0]["type"] == "literal_error"
