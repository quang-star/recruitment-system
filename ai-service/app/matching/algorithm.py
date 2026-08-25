from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class MatchResult:
    status: str
    final_score: float
    quality_flags: list[str]
    components: list[dict[str, Any]]
    claims: list[dict[str, Any]]


def compute_match(cv_payload: dict[str, Any], jd_payload: dict[str, Any]) -> MatchResult:
    cv_skills = {
        str(skill.get("canonicalSkillId"))
        for skill in cv_payload.get("skills", [])
        if skill.get("normalizationStatus") == "KNOWN" and skill.get("canonicalSkillId")
    }
    required = _skills(jd_payload.get("requirements", {}).get("requiredSkills", []))
    preferred = _skills(jd_payload.get("requirements", {}).get("preferredSkills", []))
    required_hits = required & cv_skills
    preferred_hits = preferred & cv_skills
    components: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []

    required_score = _ratio(required_hits, required)
    components.append(_component("REQUIRED_SKILLS", 45, required_score,
                                 {"matched": len(required_hits), "required": len(required)}))
    for skill_id in sorted(required):
        claims.append({"type": "SUPPORTED" if skill_id in cv_skills else "MISSING",
                       "subject": "REQUIRED_SKILL", "skillId": skill_id})

    preferred_score = _ratio(preferred_hits, preferred)
    components.append(_component("PREFERRED_SKILLS", 15, preferred_score,
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
    title_score = 1.0 if family and family in cv_title.casefold() else (0.5 if cv_title else 0.0)
    components.append(_component("TITLE_SENIORITY", 10, title_score, {"family": family or None}))

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
    components.append(_component("RESPONSIBILITY_SIMILARITY", 5, responsibility_score, {}))

    applicable = [component for component in components if component["weight"] > 0]
    weight_total = sum(component["weight"] for component in applicable) or 1
    final_score = round(sum(component["contribution"] for component in applicable) / weight_total * 100, 2)
    flags: list[str] = []
    if not required:
        flags.append("NO_REQUIRED_SKILLS")
    if not cv_skills:
        flags.append("CV_SKILLS_UNAVAILABLE")
    if any(component["score"] < 1 for component in applicable):
        flags.append("PARTIAL_REQUIREMENTS")
    return MatchResult(
        status="COMPLETED" if cv_skills or not required else "DEGRADED",
        final_score=max(0.0, min(100.0, final_score)),
        quality_flags=flags, components=components, claims=claims,
    )


def _skills(items: list[dict[str, Any]]) -> set[str]:
    return {str(item["canonicalSkillId"]) for item in items if item.get("canonicalSkillId")}


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
