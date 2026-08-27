from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ALGORITHM_VERSION = "baseline-v2"


@dataclass(frozen=True, slots=True)
class MatchResult:
    status: str
    final_score: float
    quality_flags: list[str]
    components: list[dict[str, Any]]
    claims: list[dict[str, Any]]


def compute_match(cv_payload: dict[str, Any], jd_payload: dict[str, Any]) -> MatchResult:
    cv_items = {
        str(skill.get("canonicalSkillId")): skill
        for skill in cv_payload.get("skills", [])
        if skill.get("normalizationStatus") == "KNOWN" and skill.get("canonicalSkillId")
    }
    unverified_cv_skills = {
        skill_id for skill_id, skill in cv_items.items()
        if skill.get("provenance") == "USER_ASSERTED" and not skill.get("evidenceIds")
    }
    cv_skills = set(cv_items) - unverified_cv_skills
    required_items = _skills(jd_payload.get("requirements", {}).get("requiredSkills", []))
    preferred_items = _skills(jd_payload.get("requirements", {}).get("preferredSkills", []))
    required = set(required_items)
    preferred = set(preferred_items)
    required_hits = required & cv_skills
    preferred_hits = preferred & cv_skills
    components: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []

    required_score = _ratio(required_hits, required)
    components.append(_component("REQUIRED_SKILLS", 45 if required else 0, required_score,
                                 {"matched": len(required_hits), "required": len(required),
                                  "unverifiedAssertions": len(required & unverified_cv_skills)}))
    for skill_id in sorted(required):
        jd_item = required_items[skill_id]
        if skill_id in cv_skills:
            claim_type = "SUPPORTED"
        elif skill_id in unverified_cv_skills:
            claim_type = "UNCERTAIN"
        else:
            claim_type = "MISSING"
        claims.append({
            "type": claim_type,
            "subject": "REQUIRED_SKILL",
            "skillId": skill_id,
            "label": str(jd_item.get("raw") or skill_id),
            "cvEvidenceIds": sorted(set(cv_items.get(skill_id, {}).get("evidenceIds", []))),
            "jdEvidenceIds": sorted(set(jd_item.get("evidenceIds", []))),
            "jdConfirmedByRecruiter": bool(jd_item.get("confirmedByRecruiter")),
        })

    preferred_score = _ratio(preferred_hits, preferred)
    components.append(_component("PREFERRED_SKILLS", 15 if preferred else 0, preferred_score,
                                 {"matched": len(preferred_hits), "preferred": len(preferred)}))
    required_months = jd_payload.get("requirements", {}).get("minimumRelevantExperienceMonths")
    actual_months = cv_payload.get("summary", {}).get("totalExperienceMonths", 0) or 0
    experience_applicable = required_months is not None
    experience_score = 1.0 if not experience_applicable else min(1.0, actual_months / max(1, required_months))
    components.append(_component("EXPERIENCE", 15 if experience_applicable else 0, experience_score,
                                 {"actualMonths": actual_months, "requiredMonths": required_months}))

    title = jd_payload.get("title", {})
    cv_title = " ".join(str(item.get("titleCanonical") or item.get("titleRaw") or "")
                        for item in cv_payload.get("experiences", []))
    family = str(title.get("canonicalFamily") or "").casefold()
    title_applicable = bool(family and family != "other")
    title_score = 1.0 if family and family in cv_title.casefold() else (0.5 if cv_title else 0.0)
    components.append(_component("TITLE_SENIORITY", 10 if title_applicable else 0,
                                 title_score, {"family": family or None}))

    education_score = 0.0
    language_score = 0.0
    applicable_metadata = False
    if jd_payload.get("requirements", {}).get("education"):
        applicable_metadata = True
        education_score = 1.0 if cv_payload.get("education") else 0.0
    if jd_payload.get("requirements", {}).get("languages"):
        applicable_metadata = True
        language_score = 1.0 if cv_payload.get("languages") else 0.0
    metadata_score = (education_score + language_score) / 2 if applicable_metadata else 0.0
    components.append(_component("EDUCATION_LANGUAGE", 10 if applicable_metadata else 0,
                                 metadata_score, {"applicable": applicable_metadata}))

    jd_responsibilities = jd_payload.get("responsibilities", [])
    cv_text = " ".join(str(item) for experience in cv_payload.get("experiences", [])
                       for item in experience.get("responsibilities", []))
    responsibility_score = _keyword_similarity(jd_responsibilities, cv_text)
    components.append(_component("RESPONSIBILITY_SIMILARITY", 5 if jd_responsibilities else 0,
                                 responsibility_score, {}))

    applicable = [component for component in components if component["weight"] > 0]
    weight_total = sum(component["weight"] for component in applicable) or 1
    final_score = round(sum(component["contribution"] for component in applicable) / weight_total * 100, 2)
    flags: list[str] = []
    if not required:
        flags.append("NO_REQUIRED_SKILLS")
    if not cv_skills:
        flags.append("CV_SKILLS_UNAVAILABLE")
    if unverified_cv_skills & (required | preferred):
        flags.append("UNVERIFIED_SKILL_ASSERTIONS")
    if any(component["score"] < 1 for component in applicable):
        flags.append("PARTIAL_REQUIREMENTS")
    if not applicable:
        flags.append("NO_APPLICABLE_COMPONENTS")
    return MatchResult(
        status=("INSUFFICIENT_DATA" if not applicable
                else "COMPLETED" if cv_skills or not required else "DEGRADED"),
        final_score=max(0.0, min(100.0, final_score)),
        quality_flags=flags, components=components, claims=claims,
    )


def _skills(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(item["canonicalSkillId"]): item
        for item in items if item.get("canonicalSkillId")
    }


def _ratio(hits: set[str], required: set[str]) -> float:
    return len(hits) / len(required) if required else 0.0


def _component(name: str, weight: int, score: float, details: dict[str, Any]) -> dict[str, Any]:
    return {"name": name, "weight": weight, "score": round(max(0.0, min(1.0, score)), 4),
            "contribution": round(weight * max(0.0, min(1.0, score)), 4), "details": details}


def _keyword_similarity(responsibilities: list[dict[str, Any]], cv_text: str) -> float:
    if not responsibilities or not cv_text:
        return 0.0
    jd_words = {word.casefold() for item in responsibilities for word in str(item.get("raw", "")).split()
                if len(word) > 3}
    cv_words = {word.casefold() for word in cv_text.split() if len(word) > 3}
    return len(jd_words & cv_words) / len(jd_words) if jd_words else 0.0
