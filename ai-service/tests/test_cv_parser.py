import json
from io import BytesIO
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from pypdf import PdfWriter

from app.cv.ocr import OcrUnavailableError
from app.cv.parser import parse_pdf, _total_experience_months


def test_text_pdf_extracts_canonical_skills_for_matching() -> None:
    fixture = Path(__file__).parent / "fixtures" / "minimal-cv.pdf"
    payload = parse_pdf(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        fixture.read_bytes(),
        ocr_enabled=False,
    )

    schema = json.loads(
        (Path(__file__).parents[2] / "contracts/schemas/parsed-cv-v1.schema.json")
        .read_text(encoding="utf-8")
    )
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)
    assert payload["document"]["parserVersion"] == "rules-v0.3.1+ocr-tesseract5+taxonomy-1.0.0"
    assert payload["document"]["textExtractionMethod"] == "EMBEDDED_TEXT"
    assert {skill["raw"] for skill in payload["skills"]} == {"Java", "Kafka"}
    assert all(skill["normalizationStatus"] == "KNOWN" for skill in payload["skills"])
    assert payload["experiences"][0]["titleCanonical"] == "BACKEND_DEVELOPER"


def test_experience_months_merge_overlapping_date_ranges() -> None:
    text = "Backend Engineer 01/2022 - 12/2023\nJava Developer 06/2023 - 05/2024"

    assert _total_experience_months(text) == 29


def test_image_only_pdf_uses_bounded_ocr_with_lower_confidence() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    content = BytesIO()
    writer.write(content)
    calls: list[tuple[int, int, float]] = []

    def fake_ocr(document: bytes, page_count: int, max_pages: int, timeout: float) -> str:
        assert document == content.getvalue()
        calls.append((page_count, max_pages, timeout))
        return (
            "Backend Engineer\n01/2022 - Present\n"
            "Develop and maintain J ava Kafka services for a recruitment platform. "
            "Build APIs, deploy services, design tests, and lead technical reviews."
        )

    payload = parse_pdf(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        content.getvalue(),
        ocr_max_pages=3,
        ocr_timeout_seconds=25,
        ocr_extractor=fake_ocr,
    )

    assert calls == [(1, 3, 25)]
    assert payload["document"]["textExtractionMethod"] == "OCR"
    assert {skill["raw"] for skill in payload["skills"]} == {"Java", "Kafka"}
    assert all(skill["confidence"] == 0.84 for skill in payload["skills"])
    assert payload["summary"]["overallConfidence"] == 0.68
    assert payload["summary"]["qualityFlags"] == ["OCR_EXTRACTION", "OCR_REVIEW_REQUIRED"]


def test_ocr_unavailable_keeps_low_signal_cv_reviewable() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    content = BytesIO()
    writer.write(content)

    def unavailable(*_args) -> str:
        raise OcrUnavailableError("not installed")

    payload = parse_pdf(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        content.getvalue(),
        ocr_extractor=unavailable,
    )

    assert payload["document"]["textExtractionMethod"] == "NONE"
    assert payload["summary"]["qualityFlags"] == [
        "LOW_TEXT_SIGNAL", "OCR_REQUIRED", "OCR_UNAVAILABLE",
        "NO_CANONICAL_SKILLS", "NO_EXPERIENCE_DETAILS",
    ]
