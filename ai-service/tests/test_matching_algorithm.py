from app.matching.algorithm import compute_match


JAVA = "32af50d2-0649-589a-b10c-ee404cef802d"
KAFKA = "0c57728e-8343-5ef2-aa80-db3df230cc81"


def test_matching_is_deterministic_and_explains_missing_required_skill() -> None:
    cv = {
        "skills": [{"canonicalSkillId": JAVA, "normalizationStatus": "KNOWN"}],
        "experiences": [{"titleRaw": "Backend Engineer", "responsibilities": ["Build backend API"]}],
        "summary": {"totalExperienceMonths": 30},
    }
    jd = {
        "title": {"canonicalFamily": "BACKEND"},
        "requirements": {
            "requiredSkills": [{"canonicalSkillId": JAVA}, {"canonicalSkillId": KAFKA}],
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
    assert sum(component["contribution"] for component in first.components) >= 0
