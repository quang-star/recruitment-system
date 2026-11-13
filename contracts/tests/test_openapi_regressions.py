from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

yaml = pytest.importorskip("yaml")
OPENAPI = Path(__file__).resolve().parents[1] / "openapi"


def load(name):
    return yaml.safe_load((OPENAPI / name).read_text(encoding="utf-8"))


def test_v2_openapi_files_are_valid_yaml():
    for path in OPENAPI.glob("*-v2.yaml"):
        document = load(path.name)
        assert document["openapi"] == "3.1.0", path.name
        assert isinstance(document["paths"], dict), path.name


def test_catalog_correlation_filters_are_uuids():
    document = load("catalog-privacy-v2.yaml")
    filters = [parameter["schema"] for path in document["paths"].values()
               for operation in path.values() if isinstance(operation, dict)
               for parameter in operation.get("parameters", []) if parameter.get("name") == "correlationId"]
    assert len(filters) == 2
    for schema in filters:
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        validator.validate("779494ac-c858-4570-a884-6e88423b8e2b")
        with pytest.raises(ValidationError):
            validator.validate("123")


def test_external_ai_notice_is_independent_of_http_version():
    for name in ("candidate-cv-v2.yaml", "job-drafts-v2.yaml"):
        text = (OPENAPI / name).read_text(encoding="utf-8")
        assert "external-ai/1.0" in text
        assert "external-ai/2.0" not in text


def test_company_approval_requires_a_shown_version_and_nonblank_bounded_reason():
    schema = load("company-approval-v2.yaml")["components"]["schemas"]["Approval"]
    validator = Draft202012Validator(schema)
    validator.validate({"version": 0, "reason": "Reviewed"})
    for value in ({}, {"version": -1, "reason": "Reviewed"}, {"version": 0, "reason": " "},
                  {"version": 0, "reason": "x" * 1001}, {"version": "0", "reason": "Reviewed"}):
        with pytest.raises(ValidationError):
            validator.validate(value)
