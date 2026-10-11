import json
import pytest
from io import BytesIO
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from pypdf import PdfWriter

from app.cv.ocr import OcrUnavailableError
from app.cv.parser import (
    parse_pdf, _education, _experience_text, _experiences, _first_date_range,
    _languages, _total_experience_months,
    _projects, _certificates, _language,
)


@pytest.mark.parametrize("text,expected", [
    ("Học vấn: 2018 - 2022 Đại học\nKinh nghiệm: 2022 - 2024 Backend Developer", 36),
    ("Education: 2018 - 2022 University", 0),
    ("Work Experience: 2090 - 2092 Backend Engineer", 0),
])
def test_inline_sections_and_future_dates(text, expected):
    assert _total_experience_months(text) == expected


def test_languages_on_same_line_have_independent_proficiency():
    values = _languages("779494ac-c858-4570-a884-6e88423b8e2b",
                        "Languages: English B2, Japanese N3", "EMBEDDED_TEXT")
    assert [(v["languageCode"], v["proficiency"]) for v in values] == [("en", "B2"), ("ja", "N3")]


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
    assert payload["document"]["parserVersion"] == "rules-v0.5.3+ocr-tesseract5+taxonomy-1.0.0"
    assert payload["document"]["textExtractionMethod"] == "EMBEDDED_TEXT"
    assert {skill["raw"] for skill in payload["skills"]} == {"Java", "Kafka"}
    assert all(skill["normalizationStatus"] == "KNOWN" for skill in payload["skills"])
    assert payload["experiences"][0]["titleCanonical"] == "BACKEND_DEVELOPER"


def test_experience_months_merge_overlapping_date_ranges() -> None:
    text = "Backend Engineer 01/2022 - 12/2023\nJava Developer 06/2023 - 05/2024"

    assert _total_experience_months(text) == 29


def test_experience_months_ignore_education_date_ranges() -> None:
    text = (
        "HỌC VẤN\n2018 - 2022\nĐại học Bách Khoa\n"
        "KINH NGHIỆM LÀM VIỆC\n2022 - 2024\nBackend Developer"
    )

    assert _total_experience_months(text) == 36
    assert _first_date_range(_experience_text(text)) == (
        "2022-01", "2024-12", False,
    )


def test_education_only_cv_does_not_report_experience_months() -> None:
    text = "HỌC VẤN\n2018 - 2022\nĐại học Bách Khoa"

    assert _total_experience_months(text) == 0


def test_explicit_vietnamese_experience_duration_is_supported() -> None:
    text = "TÓM TẮT\nCó 3 năm kinh nghiệm phát triển phần mềm"

    assert _total_experience_months(text) == 36


def test_multiple_experiences_keep_skills_and_responsibilities_in_their_own_job() -> None:
    text = (
        "KINH NGHIỆM LÀM VIỆC\n"
        "Backend Developer - Công ty A\n01/2022 - 12/2023\n"
        "Phát triển REST API bằng Java và Spring Boot\n"
        "Frontend Developer - Công ty B\n01/2024 - Hiện tại\n"
        "Phát triển giao diện bằng React và TypeScript\n"
        "HỌC VẤN\n2018 - 2022\nĐại học Bách Khoa"
    )

    experiences = _experiences(
        "779494ac-c858-4570-a884-6e88423b8e2b", _experience_text(text), "EMBEDDED_TEXT",
    )

    assert len(experiences) == 2
    assert experiences[0]["titleCanonical"] == "BACKEND_DEVELOPER"
    assert experiences[0]["startMonth"] == "2022-01"
    assert experiences[0]["endMonth"] == "2023-12"
    assert experiences[0]["responsibilities"] == [
        "Phát triển REST API bằng Java và Spring Boot",
    ]
    assert experiences[1]["titleCanonical"] == "FRONTEND_DEVELOPER"
    assert experiences[1]["startMonth"] == "2024-01"
    assert experiences[1]["endMonth"] is None
    assert experiences[1]["isCurrent"] is True
    assert experiences[1]["responsibilities"] == [
        "Phát triển giao diện bằng React và TypeScript",
    ]
    assert experiences[0]["skillIds"]
    assert experiences[1]["skillIds"]
    assert set(experiences[0]["skillIds"]).isdisjoint(experiences[1]["skillIds"])
    assert experiences[0]["evidenceIds"] != experiences[1]["evidenceIds"]


def test_cv_extracts_education_and_languages_from_explicit_sections() -> None:
    text = (
        "HỌC VẤN\nCử nhân Công nghệ thông tin\n2018 - 2022\n"
        "NGÔN NGỮ\nTiếng Anh - B2\nTiếng Nhật - N3"
    )

    education = _education("779494ac-c858-4570-a884-6e88423b8e2b", text, "EMBEDDED_TEXT")
    languages = _languages("779494ac-c858-4570-a884-6e88423b8e2b", text, "EMBEDDED_TEXT")

    assert education[0]["degreeLevel"] == "BACHELOR"
    assert education[0]["fieldOfStudy"] == "Information Technology"
    assert education[0]["startMonth"] == "2018-01"
    assert education[0]["endMonth"] == "2022-12"
    assert [(item["languageCode"], item["proficiency"]) for item in languages] == [
        ("en", "B2"), ("ja", "N3"),
    ]


def test_cv_does_not_treat_ordinary_document_language_as_language_proficiency() -> None:
    assert _languages(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "Backend developer with English documentation experience.",
        "EMBEDDED_TEXT",
    ) == []


@pytest.mark.parametrize("start,end,expected", [
    ("August 2011", "December 2013", ("2011-08", "2013-12", False)),
    ("Sep. 2020", "Sept 2021", ("2020-09", "2021-09", False)),
    ("May 2014", "Current", ("2014-05", None, True)),
])
def test_named_month_ranges_can_span_pdf_lines(start, end, expected):
    assert _first_date_range(f"{start}\n \nto\n{end}") == expected


def test_named_month_duration_excludes_education_and_merges_overlap():
    text = (
        "Experience\nSystems Analyst\nMay 2011 to August 2011\n"
        "Data Analyst\nAugust 2011 to December 2013\n"
        "Education\nSeptember 2005 to June 2010"
    )
    assert _total_experience_months(text) == 32


def test_pdf_split_dates_keep_technical_roles_and_job_evidence_separate():
    # Synthetic reproduction of the layout, not personal resume content.
    text = (
        "Experience\nRF Systems Engineer\nMay 2014\n \nto\nCurrent\nCompany A\n"
        "Summary\n\u00c2\u00b7 Design Java services for equipment monitoring.\n"
        "System Data Analyst\nAugust 2011\n \nto\nDecember 2013\nCompany B\n"
        "Develop SQL reports for operational data.\n"
        "Electrical/Validation Engineer\nMay 2011\nto\nAugust 2011\nCompany C\n"
        "Build Python tools for automated testing.\n"
        "Education\nBachelor of Engineering\nSeptember 2005 to June 2010"
    )
    jobs = _experiences("pilot-regression", _experience_text(text), "EMBEDDED_TEXT")
    assert [job["titleRaw"] for job in jobs] == [
        "RF Systems Engineer", "System Data Analyst", "Electrical/Validation Engineer",
    ]
    assert jobs[1]["titleCanonical"] is None
    assert [(job["startMonth"], job["endMonth"]) for job in jobs] == [
        ("2014-05", None), ("2011-08", "2013-12"), ("2011-05", "2011-08"),
    ]
    assert jobs[0]["isCurrent"] is True
    assert "Develop SQL reports for operational data." in jobs[1]["responsibilities"]
    assert all(jobs[i]["skillIds"] for i in range(3))
    assert set(jobs[0]["skillIds"]).isdisjoint(jobs[1]["skillIds"])
    assert len({job["evidenceIds"][0] for job in jobs}) == 3


def test_technician_title_is_preserved_without_inventing_canonical_role():
    jobs = _experiences(
        "pilot-technician",
        "Information Technology Technician I\nAug 2007\nto\nCurrent\n"
        "Maintain Linux systems and deploy updates.",
        "EMBEDDED_TEXT",
    )
    assert len(jobs) == 1
    assert jobs[0]["titleRaw"] == "Information Technology Technician I"
    assert jobs[0]["titleCanonical"] is None
    assert jobs[0]["startMonth"] == "2007-08"


@pytest.mark.parametrize("text", [
    "Collaborated with a data analyst on reports.",
    "Assisted network administrator with daily tasks including backups.",
    "Provided support to the systems administrator.",
])
def test_analyst_responsibility_is_not_promoted_to_job_title(text):
    assert _experiences(
        "pilot-no-title", text, "EMBEDDED_TEXT",
    ) == []


def test_inline_dates_are_not_part_of_raw_job_title():
    jobs = _experiences(
        "pilot-inline", "Systems Administrator Aug 2019 to Dec 2020\nMaintain Linux systems.",
        "EMBEDDED_TEXT",
    )
    assert jobs[0]["titleRaw"] == "Systems Administrator"
    assert jobs[0]["endMonth"] == "2020-12"


def test_previous_job_responsibility_is_not_used_as_next_job_title():
    jobs = _experiences(
        "pilot-title-boundary",
        "IT Technician\nAug 2007 to Dec 2010\n"
        "Reviewing systems reporting in Configuration Manager.\n"
        "Creating policies and procedural documentation.\n"
        "Information Services Liaison\nAug 2005 to Aug 2007\n"
        "Maintain Linux systems.",
        "EMBEDDED_TEXT",
    )
    assert [job["titleRaw"] for job in jobs] == ["IT Technician", "Information Services Liaison"]


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


def test_project_and_certificate_sections_are_extracted_without_using_work_history():
    text = "Projects\nRecruitment portal\nBuild Java services.\nCertifications\nAWS Certified Developer\nExperience\nBackend Engineer"
    assert _projects("cv", text)[0]["name"] == "Recruitment portal"
    assert _certificates("cv", text)[0]["name"] == "AWS Certified Developer"
    assert _projects("cv", "Experience\nBackend Engineer") == []


def test_encoding_artifact_is_not_mistaken_for_vietnamese():
    assert _language("Experience\n\u00c2\u00b7 Build systems with Java") == "en"
    assert _language("Kinh nghiệm phát triển phần mềm") == "vi"


def test_dated_projects_split_without_blank_lines_and_keep_skills_separate():
    text = """PROJECTS
RECRUITMENT PORTAL Jun 2026 - Present
Build Java backend services.
Role: Backend Developer
FINANCE APP Apr 2026 - Jun 2026
Build Python expense tracking.
SOCIAL NETWORK Oct 2025 - Jan 2026
Build React social features.
"""
    projects = _projects("cv", text)
    assert [p["name"] for p in projects] == ["RECRUITMENT PORTAL", "FINANCE APP", "SOCIAL NETWORK"]
    assert "FINANCE" not in projects[0]["description"]
    assert "SOCIAL" not in projects[1]["description"]
    assert "Jun 2026 - Present" in projects[0]["description"]
    assert not set(projects[0]["skillIds"]) & set(projects[1]["skillIds"])
    assert len({p["evidenceIds"][0] for p in projects}) == 3


def test_project_paragraphs_and_dated_bullets_do_not_create_extra_projects():
    text = """Projects
Recruitment Portal Jun 2026 - Present
Build Java services.

Role: Backend Developer
- Migration Jun 2026 - Jul 2026
More details on the same project.
Finance App Apr 2026 - Jun 2026
Build Python services.
"""
    projects = _projects("cv", text)
    assert [p["name"] for p in projects] == ["Recruitment Portal", "Finance App"]
    assert "More details" in projects[0]["description"]


def test_undated_projects_still_split_on_blank_lines():
    projects = _projects("cv", "Projects\nFirst portal\nBuild Java.\n\nSecond portal\nBuild React.")
    assert [p["name"] for p in projects] == ["First portal", "Second portal"]


def test_skill_location_points_to_actual_page_and_text_span():
    from app.shared.evidence import skill_locations
    pages = ["Summary", "", "Experience with Java"]
    text = "\n".join(page for page in pages if page)
    locations = skill_locations(text, [{"raw": "Java", "evidenceIds": ["test-evidence"]}], pages)
    assert locations[0]["page"] == 3
    assert text[locations[0]["start"]:locations[0]["end"]] == "Java"
