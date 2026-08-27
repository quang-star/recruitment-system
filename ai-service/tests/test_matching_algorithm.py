from app.matching.algorithm import compute_match


JAVA = "32af50d2-0649-589a-b10c-ee404cef802d"
KAFKA = "0c57728e-8343-5ef2-aa80-db3df230cc81"


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
