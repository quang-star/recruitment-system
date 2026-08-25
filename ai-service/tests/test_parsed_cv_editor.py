from __future__ import annotations

import copy
import json
from pathlib import Path
from uuid import UUID

import pytest

from app.cv.api import _validate_user_payload
from app.shared.api import ApiContractError


EXAMPLE = Path(__file__).resolve().parents[2] / "contracts" / "examples" / "parsed-cv-v1.example.json"
CV_VERSION_ID = UUID("779494ac-c858-4570-a884-6e88423b8e2b")


def payload() -> dict:
    value = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    value["document"]["cvVersionId"] = str(CV_VERSION_ID)
    return value


def test_user_payload_marks_skills_as_candidate_authored() -> None:
    value = payload()
    value["skills"][0].pop("provenance", None)

    validated = _validate_user_payload(CV_VERSION_ID, value)

    assert validated["skills"][0]["provenance"] == "USER_ASSERTED"
    assert validated["skills"][1]["provenance"] == "USER_CONFIRMED"


@pytest.mark.parametrize("mutation", [
    lambda value: value.update(schemaVersion="parsed-cv/0.9"),
    lambda value: value["document"].update(cvVersionId="d1e9d7cb-15d0-4bc7-b6e4-bf5ce3e8ea89"),
    lambda value: value.pop("summary"),
])
def test_user_payload_rejects_inconsistent_payload(mutation) -> None:
    value = copy.deepcopy(payload())
    mutation(value)

    with pytest.raises(ApiContractError):
        _validate_user_payload(CV_VERSION_ID, value)
