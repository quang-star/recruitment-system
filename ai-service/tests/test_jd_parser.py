import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from app.jd.parser import parse_jd


def test_parser_returns_contract_compatible_canonical_skills() -> None:
    payload = parse_jd(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        "Senior Backend Engineer",
        "Thiết kế và vận hành các dịch vụ backend.",
        "Java, Kafka và tối thiểu 3 năm kinh nghiệm.",
    )

    schema = json.loads((Path(__file__).parents[2] / "contracts/schemas/parsed-jd-v1.schema.json").read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)
    assert payload["document"]["parserVersion"] == "rules-v0.2.0+taxonomy-1.0.0"
    assert {skill["raw"] for skill in payload["requirements"]["requiredSkills"]} == {"Java", "Kafka"}
    assert payload["requirements"]["minimumRelevantExperienceMonths"] == 36
    assert payload["responsibilities"]


def test_parser_does_not_invent_unknown_skill_ids() -> None:
    payload = parse_jd(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        "Platform Engineer",
        "Build reliable services.",
        "Experience with an unknown internal tool.",
    )

    assert payload["requirements"]["requiredSkills"] == []
    assert "NO_CANONICAL_SKILLS" in payload["qualityFlags"]


def test_parser_normalizes_known_aliases_without_duplicate_skill_rows() -> None:
    payload = parse_jd(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        "Backend Engineer", "Build APIs.", "SpringBoot, Postgres and React.js.",
    )

    skills = payload["requirements"]["requiredSkills"]
    assert {skill["raw"] for skill in skills} == {"SpringBoot", "Postgres", "React.js"}
    assert len({skill["canonicalSkillId"] for skill in skills}) == 3


def test_parser_keeps_required_and_preferred_skills_separate() -> None:
    payload = parse_jd(
        "779494ac-c858-4570-a884-6e88423b8e2b",
        "0cb83583181fc5bdb09aa37cf82ab5f89e7438e88925de3e6e1f0f0eddb76382",
        "Backend Engineer",
        "Build APIs for the platform.",
        "Required: Java and PostgreSQL.\nNice to have: Kafka and Docker.",
    )

    assert {skill["raw"] for skill in payload["requirements"]["requiredSkills"]} == {
        "Java", "PostgreSQL",
    }
    assert {skill["raw"] for skill in payload["requirements"]["preferredSkills"]} == {
        "Kafka", "Docker",
    }
