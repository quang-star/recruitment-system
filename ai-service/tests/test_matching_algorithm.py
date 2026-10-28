from identity_fixtures import legacy_id
from app.matching.algorithm import ALGORITHM_VERSION, compute_match
import pytest


JAVA = str(legacy_id('32af50d2-0649-589a-b10c-ee404cef802d'))
KAFKA = str(legacy_id('0c57728e-8343-5ef2-aa80-db3df230cc81'))


def test_matching_is_deterministic_and_explains_missing_required_skill() -> None:
    cv = {
        "skills": [{"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN",
                    "provenance": "EXTRACTED", "evidenceIds": ["cv-java-evidence"]}],
        "experiences": [{"titleRaw": "Backend Engineer", "responsibilities": ["Build backend API"]}],
        "summary": {"totalExperienceMonths": 30},
    }
    jd = {
        "title": {"canonicalFamily": "BACKEND"},
        "requirements": {
            "requiredSkills": [
                {"canonicalSkillId": JAVA, "raw": "Java", "evidenceIds": ["jd-java-evidence"],
                 "confirmedByRecruiter": True},
                {"canonicalSkillId": KAFKA, "raw": "Kafka", "evidenceIds": ["jd-kafka-evidence"],
                 "confirmedByRecruiter": True},
            ],
            "preferredSkills": [], "minimumRelevantExperienceMonths": 24,
            "education": [], "languages": [],
        },
        "responsibilities": [{"raw": "Build backend API"}],
    }

    first = compute_match(cv, jd)
    second = compute_match(cv, jd)

    assert first == second
    assert 0 <= first.final_score <= 100
    assert first.status == "COMPLETED"
    assert any(claim["type"] == "MISSING" and claim["skillId"] == KAFKA for claim in first.claims)
    assert any(claim["type"] == "MISSING" and claim["label"] == "Kafka" for claim in first.claims)
    supported = next(claim for claim in first.claims if claim["skillId"] == JAVA)
    assert supported["cvEvidenceIds"] == ["cv-java-evidence"]
    assert supported["jdEvidenceIds"] == ["jd-java-evidence"]
    assert sum(component["contribution"] for component in first.components) >= 0
    assert next(component for component in first.components
                if component["name"] == "PREFERRED_SKILLS")["weight"] == 0


def test_matching_reports_insufficient_data_when_no_component_applies() -> None:
    result = compute_match(
        {"skills": [], "experiences": [], "summary": {"totalExperienceMonths": 0}},
        {"title": {"canonicalFamily": "OTHER"}, "requirements": {
            "requiredSkills": [], "preferredSkills": [], "minimumRelevantExperienceMonths": None,
            "education": [], "languages": [],
        }, "responsibilities": []},
    )

    assert result.status == "INSUFFICIENT_DATA"
    assert result.final_score == 0
    assert "NO_APPLICABLE_COMPONENTS" in result.quality_flags
    assert all(component["weight"] == 0 for component in result.components)


def test_user_asserted_skill_without_evidence_is_uncertain_and_not_scored_as_a_hit() -> None:
    result = compute_match(
        {"skills": [{"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN",
                     "provenance": "USER_ASSERTED", "evidenceIds": []}],
         "experiences": [], "summary": {"totalExperienceMonths": 0}},
        {"title": {"canonicalFamily": "OTHER"}, "requirements": {
            "requiredSkills": [{"canonicalSkillId": JAVA, "raw": "Java",
                                "evidenceIds": ["jd-java-evidence"],
                                "confirmedByRecruiter": True}],
            "preferredSkills": [], "minimumRelevantExperienceMonths": None,
            "education": [], "languages": [],
        }, "responsibilities": []},
    )

    required = next(component for component in result.components
                    if component["name"] == "REQUIRED_SKILLS")
    assert required["score"] == 0
    assert result.claims[0]["type"] == "UNCERTAIN"
    assert "UNVERIFIED_SKILL_ASSERTIONS" in result.quality_flags


def _metadata_result(*, cv_education=None, cv_languages=None, jd_education=None, jd_languages=None):
    return compute_match(
        {"skills": [], "experiences": [], "education": cv_education or [],
         "languages": cv_languages or [], "summary": {"totalExperienceMonths": 0}},
        {"title": {"canonicalFamily": "OTHER"}, "requirements": {
            "requiredSkills": [], "preferredSkills": [], "minimumRelevantExperienceMonths": None,
            "education": jd_education or [], "languages": jd_languages or [],
        }, "responsibilities": []},
    )


def _metadata_component(result):
    return next(component for component in result.components
                if component["name"] == "EDUCATION_LANGUAGE")


def test_algorithm_version_changes_when_metadata_formula_changes() -> None:
    assert ALGORITHM_VERSION == "baseline-v5"


def test_education_only_requirement_uses_only_education_denominator() -> None:
    result = _metadata_result(
        cv_education=[{"degreeLevel": "Bachelor", "fieldOfStudy": "Computer Science"}],
        jd_education=[{"raw": "Bachelor degree", "normalizedValue": "bachelor"}],
    )

    component = _metadata_component(result)
    assert component["score"] == 1.0
    assert component["details"]["education"]["matchedValues"] == ["bachelor"]
    assert component["details"]["languages"]["applicable"] is False


def test_language_only_requirement_matches_language_code_not_any_language() -> None:
    requirement = [{"raw": "English", "normalizedValue": "English"}]
    matching = _metadata_result(cv_languages=[{"languageCode": "en", "proficiency": "B2"}],
                                jd_languages=requirement)
    wrong_language = _metadata_result(cv_languages=[{"languageCode": "fr", "proficiency": "C1"}],
                                      jd_languages=requirement)

    assert _metadata_component(matching)["score"] == 1.0
    wrong_component = _metadata_component(wrong_language)
    assert wrong_component["score"] == 0.0
    assert wrong_component["details"]["languages"]["dataAvailable"] is True
    assert wrong_component["details"]["languages"]["matchedCodes"] == []


def test_education_and_language_are_averaged_only_when_both_apply() -> None:
    result = _metadata_result(
        cv_education=[{"degreeLevel": "Bachelor", "fieldOfStudy": None}],
        cv_languages=[{"languageCode": "fr", "proficiency": None}],
        jd_education=[{"raw": "Bachelor", "normalizedValue": "bachelor"}],
        jd_languages=[{"raw": "English", "normalizedValue": "en"}],
    )

    assert _metadata_component(result)["score"] == 0.5


def test_metadata_has_zero_weight_when_no_requirement_applies() -> None:
    component = _metadata_component(_metadata_result(
        cv_education=[{"degreeLevel": "Bachelor", "fieldOfStudy": None}],
        cv_languages=[{"languageCode": "en", "proficiency": "B2"}],
    ))

    assert component["weight"] == 0
    assert component["score"] == 0.0
    assert component["details"]["applicable"] is False


def _experience_result(jobs, months=24):
    return compute_match(
        {"experiences": jobs, "summary": {"totalExperienceMonths": 999}},
        {"title": {"canonicalFamily": "BACKEND"}, "requirements": {"minimumRelevantExperienceMonths": months}},
        as_of_month="2026-09",
    )


def test_unrelated_career_and_title_do_not_earn_backend_credit():
    result = _experience_result([{"titleRaw": "Frontend Developer", "startMonth": "2015-01", "endMonth": "2025-12"}])
    components = {item["name"]: item for item in result.components}
    assert components["EXPERIENCE"]["score"] == 0
    assert components["TITLE_SENIORITY"]["score"] == 0


def test_relevant_experience_merges_overlaps_and_uses_fixed_cutoff():
    result = _experience_result([
        {"titleRaw": "Backend Engineer", "startMonth": "2025-01", "endMonth": "2025-12"},
        {"titleRaw": "Back-end Developer", "startMonth": "2025-06", "isCurrent": True},
        {"titleRaw": "Backend Developer", "startMonth": "2099-01", "isCurrent": True},
    ])
    component = next(item for item in result.components if item["name"] == "EXPERIENCE")
    assert component["details"]["actualMonths"] == 21
    assert component["score"] == 0.875
    assert "RELEVANT_EXPERIENCE_DATES_MISSING" in result.quality_flags


def test_zero_month_requirement_is_satisfied_without_inventing_experience():
    component = next(item for item in _experience_result([], 0).components if item["name"] == "EXPERIENCE")
    assert component["score"] == 1
    assert component["details"]["actualMonths"] == 0


@pytest.mark.parametrize("required,actual,score", [
    ("English B2", "B1", 0), ("English B2", "C1", 1),
    ("English IELTS 6.5", "IELTS 6.0", 0), ("English IELTS 6.5", "IELTS 7.0", 1),
    ("English IELTS 6.5", "B2", 0), ("English B2", None, 0),
])
def test_language_proficiency_requires_comparable_sufficient_level(required, actual, score):
    result = _metadata_result(cv_languages=[{"languageCode": "en", "proficiency": actual}],
                              jd_languages=[{"normalizedValue": "en", "raw": required}])
    assert _metadata_component(result)["score"] == score


def test_matching_evidence_only_copies_referenced_locations_not_private_text():
    location = {"id": "e1", "page": 2, "start": 10, "end": 14}
    cv = {"skills": [{"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN", "evidenceIds": ["e1"]}],
          "evidence": [location, {"id": "unrelated", "page": 5, "start": 1, "end": 2}]}
    jd = {"requirements": {"requiredSkills": [{"canonicalSkillId": JAVA, "raw": "Java"}]}}
    assert compute_match(cv, jd).claims[0]["cvLocations"] == [location]
