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
    assert ALGORITHM_VERSION == "baseline-v7"


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


@pytest.mark.parametrize("actual,required,score", [
    ("MASTER", "bachelor", 1.0), ("DOCTORATE", "master", 1.0), ("BACHELOR", "bachelor", 1.0),
    ("ASSOCIATE", "bachelor", 0.0), ("BACHELOR", "master", 0.0),
])
def test_higher_degree_satisfies_lower_degree_requirement(actual, required, score):
    result = _metadata_result(cv_education=[{"degreeLevel": actual, "fieldOfStudy": None}],
                              jd_education=[{"raw": required, "normalizedValue": required}])
    assert _metadata_component(result)["score"] == score


def test_field_of_study_requirement_is_still_matched_as_text():
    result = _metadata_result(cv_education=[{"degreeLevel": "MASTER", "fieldOfStudy": "Computer Science"}],
                              jd_education=[{"raw": "Computer Science", "normalizedValue": "computer science"}])
    assert _metadata_component(result)["score"] == 1.0


def test_preferred_education_and_language_are_reported_but_not_penalised():
    result = _metadata_result(
        cv_education=[{"degreeLevel": "BACHELOR", "fieldOfStudy": None}],
        cv_languages=[{"languageCode": "en", "proficiency": None}],
        jd_education=[{"raw": "Ưu tiên thạc sĩ", "normalizedValue": "master", "required": False}],
        jd_languages=[{"raw": "Ưu tiên tiếng Nhật N3", "normalizedValue": "ja", "required": False}],
    )
    component = _metadata_component(result)
    assert component["weight"] == 0
    assert component["details"]["education"]["preferredValues"] == ["master"]
    assert component["details"]["education"]["preferredMatchedValues"] == []
    assert component["details"]["languages"]["preferredCodes"] == ["ja"]
    assert "LANGUAGE_PROFICIENCY_UNVERIFIED" not in result.quality_flags


def test_preferred_item_does_not_dilute_required_item():
    result = _metadata_result(
        cv_languages=[{"languageCode": "en", "proficiency": "B2"}],
        jd_languages=[{"raw": "English B2", "normalizedValue": "en"},
                      {"raw": "Ưu tiên tiếng Nhật", "normalizedValue": "ja", "required": False}],
    )
    assert _metadata_component(result)["score"] == 1.0


@pytest.mark.parametrize("sentence,code,actual,score", [
    ("English B2 or Japanese N3 is required", "ja", "N2", 1),
    ("English B2 or Japanese N3 is required", "ja", "N4", 0),
    ("English B2 or Japanese N3 is required", "en", "B2", 1),
    ("IELTS 6.5 English, Japanese N3", "en", "IELTS 7.0", 1),
    ("IELTS 6.5 English, Japanese N3", "en", "IELTS 6.0", 0),
    ("Tiếng Anh B2, tiếng Nhật N3", "ja", "N3", 1),
])
def test_each_language_reads_its_own_level_from_a_shared_sentence(sentence, code, actual, score):
    result = _metadata_result(cv_languages=[{"languageCode": code, "proficiency": actual}],
                              jd_languages=[{"raw": sentence, "normalizedValue": code}])
    assert _metadata_component(result)["score"] == score


def test_job_without_required_skills_is_degraded_even_with_a_perfect_title_score():
    result = compute_match(
        {"experiences": [{"titleRaw": "Backend Developer"}]},
        {"title": {"canonicalFamily": "BACKEND"}, "requirements": {
            "requiredSkills": [], "preferredSkills": [], "minimumRelevantExperienceMonths": None,
            "education": [], "languages": [],
        }, "responsibilities": []},
    )
    assert result.final_score == 100
    assert result.status == "DEGRADED"
    assert "NO_REQUIRED_SKILLS" in result.quality_flags


def test_malformed_optional_fields_do_not_crash_matching():
    cv = {"skills": [{"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN", "evidenceIds": ["e1"]}],
          "evidence": [{"page": 1}, {"id": "e1", "page": 1, "start": 0, "end": 4}],
          "experiences": [{"titleRaw": "Developer", "skillIds": None, "startMonth": "2024-01", "isCurrent": True}]}
    jd = {"requirements": {"requiredSkills": [{"canonicalSkillId": JAVA, "raw": "Java"}],
                           "minimumRelevantExperienceMonths": 12},
          "evidence": None}
    result = compute_match(cv, jd, as_of_month="2026-01")
    assert result.claims[0]["cvLocations"] == [{"id": "e1", "page": 1, "start": 0, "end": 4}]
    assert result.claims[0]["jdLocations"] == []


def test_title_seniority_evaluates_jd_level_against_cv_experiences() -> None:
    jd = {
        "title": {"raw": "Senior Backend Engineer", "canonicalFamily": "BACKEND", "level": "SENIOR"},
        "requirements": {"requiredSkills": [], "preferredSkills": [], "minimumRelevantExperienceMonths": None,
                         "education": [], "languages": []},
        "responsibilities": [],
    }
    senior = compute_match({"experiences": [{"titleRaw": "Senior Backend Engineer"}]}, jd)
    junior = compute_match({"experiences": [{"titleRaw": "Junior Backend Engineer"}]}, jd)
    unleveled = compute_match({"experiences": [{"titleRaw": "Backend Developer"}]}, jd)
    senior_comp = next(c for c in senior.components if c["name"] == "TITLE_SENIORITY")
    junior_comp = next(c for c in junior.components if c["name"] == "TITLE_SENIORITY")
    unleveled_comp = next(c for c in unleveled.components if c["name"] == "TITLE_SENIORITY")

    assert senior_comp["details"]["seniorityEvaluated"] is True
    assert senior_comp["score"] == 1.0
    assert senior_comp["details"]["cvLevel"] == "SENIOR"
    assert junior_comp["score"] == 0.7
    assert junior_comp["details"]["cvLevel"] == "JUNIOR"
    assert unleveled_comp["score"] == 0.8
    assert "CV_SENIORITY_UNVERIFIED" in unleveled.quality_flags
    assert "SENIORITY_NOT_EVALUATED" not in unleveled.quality_flags


def test_responsibility_similarity_uses_ngram_cosine_and_optional_local_hook() -> None:
    jd = {
        "title": {"canonicalFamily": "OTHER"},
        "requirements": {"requiredSkills": [], "preferredSkills": [], "minimumRelevantExperienceMonths": None,
                         "education": [], "languages": []},
        "responsibilities": [{"raw": "Design backend REST APIs with PostgreSQL caching"}],
    }
    cv = {"experiences": [{"titleRaw": "Dev", "responsibilities": ["Develop scalable backend REST APIs using PostgreSQL"]}]}
    lexical = compute_match(cv, jd)
    lexical_comp = next(c for c in lexical.components if c["name"] == "RESPONSIBILITY_SIMILARITY")
    assert lexical_comp["details"]["method"] == "tfidf-ngram-cosine-v1"
    assert 0.3 < lexical_comp["score"] < 1.0

    hooked = compute_match(cv, jd, responsibility_similarity_fn=lambda _j, _c: 0.91)
    hooked_comp = next(c for c in hooked.components if c["name"] == "RESPONSIBILITY_SIMILARITY")
    assert hooked_comp["details"]["method"] == "local-embedding-cosine-v1"
    assert hooked_comp["score"] == 0.91


def test_missing_critical_skill_applies_versioned_penalty_without_auto_rejecting() -> None:
    cv = {
        "skills": [{"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN",
                    "provenance": "EXTRACTED", "evidenceIds": ["e-java"]}],
        "experiences": [{"titleRaw": "Backend Developer", "startMonth": "2023-01", "endMonth": "2026-01", "evidenceIds": ["e-exp"]}],
    }
    jd = {
        "title": {"canonicalFamily": "BACKEND"},
        "requirements": {
            "requiredSkills": [
                {"canonicalSkillId": JAVA, "raw": "Java", "criticality": "CRITICAL", "confirmedByRecruiter": True},
                {"canonicalSkillId": KAFKA, "raw": "Kafka", "criticality": "CRITICAL", "confirmedByRecruiter": True},
            ],
            "preferredSkills": [], "minimumRelevantExperienceMonths": 24, "education": [], "languages": [],
        },
        "responsibilities": [],
    }
    res = compute_match(cv, jd, as_of_month="2026-02")
    assert res.status == "COMPLETED"
    assert res.penalty_version == "penalty-v1"
    assert res.penalty == 7.5
    assert "CRITICAL_REQUIREMENT_PENALTY" in res.quality_flags
    # Base score = (45*0.5 + 15*1 + 10*1) / 70 * 100 = 67.86; after 7.5 penalty = 60.36
    assert res.final_score == pytest.approx(60.36, abs=0.05)


def test_confidence_and_component_claims_reflect_evidence_and_limitations() -> None:
    full = compute_match(
        {
            "skills": [
                {"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN", "provenance": "EXTRACTED", "evidenceIds": ["ev1"]},
                {"canonicalSkillId": KAFKA, "normalizationStatus": "KNOWN", "provenance": "EXTRACTED", "evidenceIds": ["ev2"]},
            ],
            "experiences": [
                {"titleRaw": "Senior Backend Engineer", "startMonth": "2022-01", "endMonth": "2026-01",
                 "responsibilities": ["Build backend API"], "evidenceIds": ["ev3"]},
            ],
            "evidence": [{"id": "ev1", "page": 1, "start": 0, "end": 4}, {"id": "ev3", "page": 1, "start": 10, "end": 40}],
        },
        {
            "title": {"raw": "Senior Backend Engineer", "canonicalFamily": "BACKEND", "level": "SENIOR"},
            "requirements": {
                "requiredSkills": [{"canonicalSkillId": JAVA, "raw": "Java", "confirmedByRecruiter": True}],
                "preferredSkills": [{"canonicalSkillId": KAFKA, "raw": "Kafka", "confirmedByRecruiter": True}],
                "minimumRelevantExperienceMonths": 24, "education": [], "languages": [],
            },
            "responsibilities": [{"raw": "Build backend API", "evidenceIds": ["jd-r1"]}],
            "evidence": [{"id": "jd-r1", "page": 1, "start": 5, "end": 22}],
        },
        as_of_month="2026-01",
    )
    degraded = compute_match(
        {"experiences": [{"titleRaw": "Backend Developer"}]},
        {"title": {"canonicalFamily": "BACKEND"}, "requirements": {"requiredSkills": []}},
    )
    assert full.confidence >= 0.85
    assert degraded.confidence <= 0.55
    claims_by_comp = {c["component"]: c for c in full.claims if c["component"] != "REQUIRED_SKILLS"}
    assert set(claims_by_comp) == {"PREFERRED_SKILLS", "EXPERIENCE", "TITLE_SENIORITY", "RESPONSIBILITY_SIMILARITY"}
    assert claims_by_comp["EXPERIENCE"]["cvLocations"] == [{"id": "ev3", "page": 1, "start": 10, "end": 40}]
    assert claims_by_comp["RESPONSIBILITY_SIMILARITY"]["limitationCode"] == "LEXICAL_NGRAM_SIMILARITY_ONLY"
