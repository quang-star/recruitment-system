from identity_fixtures import legacy_id
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
from types import SimpleNamespace

from pydantic import SecretStr, ValidationError
from pypdf import PdfWriter
import pytest

from app.cv.parser import parse_pdf
from app.evaluation import extraction_smoke, gemini_smoke, ocr_smoke


def _jd_payload(flag):
    return {
        "document": {"parserVersion": "synthetic-rules+provider", "sourceHash": "a" * 64},
        "requirements": {
            "requiredSkills": [{"raw": "Java", "evidenceIds": ["synthetic-evidence"]}],
            "preferredSkills": [{"raw": "Kafka", "evidenceIds": ["synthetic-evidence"]}],
            "education": [],
        },
        "qualityFlags": [flag],
        "evidence": [],
    }


def _mock_jd_inputs(monkeypatch, module, payload, *, enabled=True):
    settings = SimpleNamespace(gemini_api_key=SecretStr("synthetic-test-key" if enabled else ""),
                               gemini_backup_api_key=SecretStr(""))
    monkeypatch.setattr(module, "Settings", lambda **kwargs: settings)
    monkeypatch.setattr(module, "parse_jd", lambda *args, **kwargs: deepcopy(payload))
    if module is gemini_smoke:
        monkeypatch.setattr(module, "GeminiExtractor", lambda settings: object())
    else:
        monkeypatch.setattr(module, "get_provider", lambda *args, **kwargs:
                            SimpleNamespace(provider="gemini") if enabled else None)


@pytest.mark.parametrize("module", [gemini_smoke, extraction_smoke])
@pytest.mark.parametrize("assisted", [True, False])
def test_jd_smoke_preserves_summary_and_fallback_exit_status(monkeypatch, capsys, module, assisted):
    flag = "GEMINI_ASSISTED_EXTRACTION" if assisted else "EXTERNAL_AI_FAILED"
    _mock_jd_inputs(monkeypatch, module, _jd_payload(flag))

    assert module.main() == (0 if assisted else 1)

    expected = {"parserVersion": "synthetic-rules+provider", "qualityFlags": [flag],
                "requiredSkills": ["Java"], "preferredSkills": ["Kafka"]}
    if module is extraction_smoke:
        expected.update(provider="gemini", passed=assisted)
    assert json.loads(capsys.readouterr().out) == expected


@pytest.mark.parametrize("module", [gemini_smoke, extraction_smoke])
def test_jd_smoke_missing_provider_config_does_not_parse(monkeypatch, capsys, module):
    _mock_jd_inputs(monkeypatch, module, {}, enabled=False)
    monkeypatch.setattr(module, "parse_jd", lambda *args, **kwargs: pytest.fail("Parser called"))

    assert module.main() == 2
    assert capsys.readouterr().out


@pytest.mark.parametrize("module", [gemini_smoke, extraction_smoke])
def test_jd_smoke_rejects_string_flags_before_reporting_success(monkeypatch, capsys, module):
    payload = _jd_payload("GEMINI_ASSISTED_EXTRACTION")
    payload["qualityFlags"] = "GEMINI_ASSISTED_EXTRACTION"
    _mock_jd_inputs(monkeypatch, module, payload)

    with pytest.raises(ValidationError):
        module.main()
    assert not capsys.readouterr().out


@pytest.mark.parametrize("case", ["summary", "missing_skill", "wrong_method"])
def test_ocr_smoke_summary_and_expected_ocr_failures(monkeypatch, capsys, tmp_path, case):
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    output = BytesIO()
    writer.write(output)
    scanned = output.getvalue()
    payload = parse_pdf(
        str(legacy_id('779494ac-c858-4570-a884-6e88423b8e2b')), "a" * 64, scanned,
        ocr_extractor=lambda *args: "Skills: Java, Kafka\nExperience\nBackend Developer\n"
        "Build and maintain reliable Java services with Kafka for the engineering team.",
    )
    if case == "wrong_method":
        payload["document"]["textExtractionMethod"] = "EMBEDDED_TEXT"
    source = tmp_path / "synthetic-source.pdf"
    source.write_bytes(scanned)
    expected_skill = "Python" if case == "missing_skill" else "Java"
    monkeypatch.setattr("sys.argv", ["ocr-smoke", "--source", str(source),
                                    "--expect-skill", expected_skill])
    monkeypatch.setattr(ocr_smoke, "_image_only_pdf", lambda source: scanned)
    monkeypatch.setattr(ocr_smoke, "parse_pdf", lambda *args, **kwargs: payload)
    schema_path = Path(__file__).parents[2] / "contracts/schemas/parsed-cv-v2.schema.json"
    read_text = Path.read_text

    def local_schema_read(path, *args, **kwargs):
        if path.as_posix() == "/app/contracts/schemas/parsed-cv-v2.schema.json":
            return read_text(schema_path, *args, **kwargs)
        return read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", local_schema_read)
    if case != "summary":
        message = ("OCR did not recover expected skills" if case == "missing_skill"
                   else "Parser did not record OCR")
        with pytest.raises(RuntimeError, match=message):
            ocr_smoke.main()
        assert not capsys.readouterr().out
        return

    ocr_smoke.main()

    assert json.loads(capsys.readouterr().out) == {
        "fixture": "synthetic-image-only-pdf", "embeddedTextCharacters": 0,
        "textExtractionMethod": "OCR", "parserVersion": payload["document"]["parserVersion"],
        "recoveredSkills": ["Java", "Kafka"],
        "overallConfidence": payload["summary"]["overallConfidence"],
        "qualityFlags": payload["summary"]["qualityFlags"], "schemaValidated": True,
    }
