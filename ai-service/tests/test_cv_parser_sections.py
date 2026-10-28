"""Synthetic regression cases for section boundaries and role claims."""
import pytest

from app.cv.parser import _experience_text, _experiences, _language, _total_experience_months


@pytest.mark.parametrize("heading", [
    "WORKING EXPERIENCE", "Work Experiences", "Professional Experiences",
    "Employment Experience", "Career History", "KINH NGHIEM LAM VIEC",
])
def test_work_history_heading_keeps_jobs_and_excludes_education(heading):
    text = (
        "Education and Training\nBachelor of Computer Science\n2015 - 2019\n"
        f"{heading}\nSoftware Engineer\n01/2020 - 12/2020\n"
        "Build Java APIs.\nSoftware Developer\n01/2021 - 12/2021\n"
        "Develop Python services.\nSkills\nJava, Python"
    )
    section = _experience_text(text)
    jobs = _experiences("section-fixture", section, "EMBEDDED_TEXT")
    assert [job["titleRaw"] for job in jobs] == ["Software Engineer", "Software Developer"]
    assert _total_experience_months(text) == 24
    assert "2015" not in section


@pytest.mark.parametrize("responsibility", [
    "Develop backend services using Java.",
    "Worked with a software engineer to review APIs.",
    "Build frontend components using React.",
    "Provided developer tooling for the team.",
    "Phát triển backend bằng Java.",
    "Builder works on project planning.",
])
def test_role_mentioned_in_responsibility_does_not_create_employment(responsibility):
    assert _experiences("responsibility-fixture", responsibility, "EMBEDDED_TEXT") == []


@pytest.mark.parametrize("title", [
    "Lead Software Engineer", "Support Engineer", "Senior Backend Developer",
    "Developer", "Development Manager", "Design Engineer",
])
def test_actual_role_titles_are_preserved(title):
    jobs = _experiences("title-fixture", f"{title}\n01/2020 - 12/2021", "EMBEDDED_TEXT")
    assert jobs[0]["titleRaw"] == title


def test_cjk_resume_with_technical_acronyms_is_not_labelled_english():
    assert _language("工作经历数据库工程师负责软件开发系统设计维护项目管理技术支持" * 3 + " SQL Java") == "unknown"
    assert _language("Experience\nSoftware Engineer\nBuild Java APIs") == "en"
    assert _language("Kinh nghiệm làm việc\nLập trình viên") == "vi"


def test_testing_titles_are_preserved_without_inventing_developer_roles():
    text = (
        "Software Tester\n01/2020 - 12/2020\nMaintain SQL test reports.\n"
        "QC Leader\n01/2021 - 12/2021\nDesign automated tests."
    )
    jobs = _experiences("tester-fixture", text, "EMBEDDED_TEXT")
    assert [job["titleRaw"] for job in jobs] == ["Software Tester", "QC Leader"]
    assert all(job["titleCanonical"] is None for job in jobs)


@pytest.mark.parametrize("title", [
    "Vice President of Engineering", "Faculty Affiliate / Data Engineering Practitioner",
])
def test_engineering_roles_are_preserved_without_substring_canonicalization(title):
    jobs = _experiences("engineering-fixture", f"{title}\n01/2020 - 12/2021", "EMBEDDED_TEXT")
    assert jobs[0]["titleRaw"] == title
    assert jobs[0]["titleCanonical"] is None
