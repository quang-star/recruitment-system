from __future__ import annotations

from app.shared.identities import JOB_SKILL_ID_MIN, parse_id
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import re
from typing import Any

from app.shared.skill_proposals import skill_name_key


ALGORITHM_VERSION = "baseline-v5"


_LANGUAGE_ALIASES = {
    "english": "en", "tiếng anh": "en", "tieng anh": "en",
    "vietnamese": "vi", "tiếng việt": "vi", "tieng viet": "vi",
    "french": "fr", "tiếng pháp": "fr", "tieng phap": "fr",
    "german": "de", "tiếng đức": "de", "tieng duc": "de",
    "japanese": "ja", "tiếng nhật": "ja", "tieng nhat": "ja",
    "korean": "ko", "tiếng hàn": "ko", "tieng han": "ko",
    "chinese": "zh", "tiếng trung": "zh", "tieng trung": "zh",
}


@dataclass(frozen=True, slots=True)
class MatchResult:
    status: str
    final_score: float
    quality_flags: list[str]
    components: list[dict[str, Any]]
    claims: list[dict[str, Any]]


def compute_match(cv_payload: dict[str, Any], jd_payload: dict[str, Any], *,
                  as_of_month: str | None = None) -> MatchResult:
    as_of_month = as_of_month or datetime.now(UTC).strftime("%Y-%m")
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
    job_version = jd_payload.get("document", {}).get("jobVersionId")
    required_items = _skills(jd_payload.get("requirements", {}).get("requiredSkills", []), job_version)
    preferred_items = _skills(jd_payload.get("requirements", {}).get("preferredSkills", []), job_version)
    preferred_items = {key: item for key, item in preferred_items.items() if key not in required_items}
    job_items = {key: item for key, item in (required_items | preferred_items).items()
                 if not item.get("canonicalSkillId")}
    pending_cv = {skill_name_key(str(skill.get("raw", ""))): skill
                  for skill in cv_payload.get("skills", []) if not skill.get("canonicalSkillId")}
    for skill_id, requirement in job_items.items():
        candidate = pending_cv.get(skill_name_key(requirement["raw"]))
        if candidate is None:
            continue
        cv_items[skill_id] = candidate
        ids = candidate.get("evidenceIds", [])
        grounded = any(location.get("id") in ids for location in cv_payload.get("evidence", []))
        if candidate.get("provenance") in {"EXTRACTED", "USER_CONFIRMED"} and ids and grounded:
            cv_skills.add(skill_id)
        else:
            unverified_cv_skills.add(skill_id)
    required = set(required_items)
    preferred = set(preferred_items)
    required_hits = required & cv_skills
    preferred_hits = preferred & cv_skills
    components: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []

    required_score = _ratio(required_hits, required)
    components.append(_component("REQUIRED_SKILLS", 45 if required else 0, required_score,
                                 {"matched": len(required_hits), "required": len(required),
                                  "unverifiedAssertions": len(required & unverified_cv_skills),
                                  "jobScoped": len(required & job_items.keys())}))
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
            "subject": "JOB_REQUIRED_SKILL" if skill_id in job_items else "REQUIRED_SKILL",
            "skillId": skill_id,
            "label": str(jd_item.get("raw") or skill_id),
            "cvEvidenceIds": sorted(set(cv_items.get(skill_id, {}).get("evidenceIds", []))),
            "jdEvidenceIds": sorted(set(jd_item.get("evidenceIds", []))),
            "jdConfirmedByRecruiter": bool(jd_item.get("confirmedByRecruiter")),
            "cvLocations": [location for location in cv_payload.get("evidence", [])
                            if location["id"] in cv_items.get(skill_id, {}).get("evidenceIds", [])],
            "jdLocations": [location for location in jd_payload.get("evidence", [])
                            if location["id"] in jd_item.get("evidenceIds", [])],
        })

    preferred_score = _ratio(preferred_hits, preferred)
    components.append(_component("PREFERRED_SKILLS", 15 if preferred else 0, preferred_score,
                                 {"matched": len(preferred_hits), "preferred": len(preferred),
                                  "jobScoped": len(preferred & job_items.keys())}))
    required_months = jd_payload.get("requirements", {}).get("minimumRelevantExperienceMonths")
    family = str(jd_payload.get("title", {}).get("canonicalFamily") or "OTHER").upper()
    experience_fact = _relevant_experience(cv_payload.get("experiences", []), family, required, as_of_month)
    actual_months = experience_fact["actualMonths"]
    experience_applicable = required_months is not None
    experience_score = 1.0 if not required_months else min(1.0, actual_months / required_months)
    components.append(_component("EXPERIENCE", 15 if experience_applicable else 0, experience_score,
                                 {**experience_fact, "requiredMonths": required_months}))

    title = jd_payload.get("title", {})
    title_applicable = family != "OTHER"
    title_score = float(any(_role_family(item) == family for item in cv_payload.get("experiences", [])))
    components.append(_component("TITLE_SENIORITY", 10 if title_applicable else 0,
                                 title_score, {"family": family, "seniorityEvaluated": False}))

    education_fact = _education_fact(
        jd_payload.get("requirements", {}).get("education", []),
        cv_payload.get("education", []),
    )
    language_fact = _language_fact(
        jd_payload.get("requirements", {}).get("languages", []),
        cv_payload.get("languages", []),
    )
    metadata_facts = [fact for fact in (education_fact, language_fact) if fact["applicable"]]
    metadata_score = (sum(float(fact["score"]) for fact in metadata_facts) / len(metadata_facts)
                      if metadata_facts else 0.0)
    components.append(_component(
        "EDUCATION_LANGUAGE", 10 if metadata_facts else 0, metadata_score,
        {"applicable": bool(metadata_facts), "education": education_fact, "languages": language_fact},
    ))

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
    if job_items:
        flags.append("JOB_SCOPED_SKILLS")
    unresolved = [item for field in ("requiredSkills", "preferredSkills")
                  for item in jd_payload.get("requirements", {}).get(field, [])
                  if not item.get("canonicalSkillId") and _job_skill_id(item, job_version) is None]
    if unresolved:
        flags.append("UNCONFIRMED_JOB_SKILLS")
    if experience_applicable and experience_fact["undatedRelevantJobs"]:
        flags.append("RELEVANT_EXPERIENCE_DATES_MISSING")
    if title.get("level"):
        flags.append("SENIORITY_NOT_EVALUATED")
    if language_fact.get("unverifiedRequirements"):
        flags.append("LANGUAGE_PROFICIENCY_UNVERIFIED")
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
                else "DEGRADED" if unresolved
                else "COMPLETED" if cv_skills or not required else "DEGRADED"),
        final_score=max(0.0, min(100.0, final_score)),
        quality_flags=flags, components=components, claims=claims,
    )


def _job_skill_id(item: dict[str, Any], job_version: str | None) -> str | None:
    raw = item.get("raw")
    if not item.get("confirmedByRecruiter") or not isinstance(raw, str) or not raw.strip():
        return None
    try:
        namespace = parse_id(str(job_version))
    except ValueError:
        return None
    digest = hashlib.sha256(f"{namespace}:job-skill:{skill_name_key(raw)}".encode()).digest()
    return str(JOB_SKILL_ID_MIN | (int.from_bytes(digest[:8], "big") & (JOB_SKILL_ID_MIN - 1)))


def _skills(items: list[dict[str, Any]], job_version: str | None = None) -> dict[str, dict[str, Any]]:
    result = {}
    for item in items:
        skill_id = item.get("canonicalSkillId") or _job_skill_id(item, job_version)
        if skill_id:
            result[str(skill_id)] = item
    return result


def _role_family(item: dict[str, Any]) -> str:
    title = str(item.get("titleCanonical") or item.get("titleRaw") or "").casefold()
    compact = re.sub(r"[-_\s]+", "", title)
    for marker, family in (("fullstack", "FULLSTACK"), ("backend", "BACKEND"),
                           ("frontend", "FRONTEND"), ("mobile", "MOBILE"),
                           ("devops", "DEVOPS"), ("data", "DATA_AI"),
                           ("machinelearning", "DATA_AI"), ("security", "SECURITY")):
        if marker in compact:
            return family
    return "QA" if re.search(r"\b(?:qa|tester|quality assurance)\b", title) else "OTHER"


def _month_index(value: Any) -> int | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", value):
        return None
    year, month = map(int, value.split("-"))
    return year * 12 + month - 1


def _relevant_experience(jobs, family: str, required: set[str], as_of_month: str) -> dict[str, Any]:
    cutoff = _month_index(as_of_month)
    if cutoff is None:
        raise ValueError("as_of_month must use YYYY-MM")
    months: set[int] = set()
    missing = 0
    relevant = 0
    for job in jobs:
        if not ((family != "OTHER" and _role_family(job) == family)
                or required.intersection(job.get("skillIds", []))):
            continue
        relevant += 1
        start = _month_index(job.get("startMonth"))
        end = cutoff if job.get("isCurrent") else _month_index(job.get("endMonth"))
        if start is None or end is None or end < start or end - start > 600 or start > cutoff:
            missing += 1
            continue
        months.update(range(start, min(end, cutoff) + 1))
    return {"actualMonths": len(months), "relevantJobs": relevant,
            "undatedRelevantJobs": missing, "asOfMonth": as_of_month,
            "method": "UNION_OF_RELEVANT_JOB_INTERVALS"}


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


def _education_fact(requirements: list[dict[str, Any]], education: list[dict[str, Any]]) -> dict[str, Any]:
    required_values = {_normalized_requirement(item) for item in requirements}
    required_values.discard("")
    actual_values = {
        normalized
        for item in education
        for normalized in (_normalize_text(item.get("degreeLevel")), _normalize_text(item.get("fieldOfStudy")))
        if normalized
    }
    matched = sorted(required for required in required_values
                     if any(_values_match(required, actual) for actual in actual_values))
    return {
        "applicable": bool(requirements),
        "score": _ratio(set(matched), required_values) if requirements else 0.0,
        "requiredValues": sorted(required_values),
        "actualValues": sorted(actual_values),
        "matchedValues": matched,
        "dataAvailable": bool(actual_values),
    }


def _language_fact(requirements: list[dict[str, Any]], languages: list[dict[str, Any]]) -> dict[str, Any]:
    required_codes = {_language_code(_normalized_requirement(item)) for item in requirements}
    required_codes.discard("")
    actual_codes = {_language_code(item.get("languageCode")) for item in languages}
    actual_codes.discard("")
    matched = set()
    satisfied = 0
    unverified = 0
    for requirement in requirements:
        code = _language_code(_normalized_requirement(requirement))
        minimum = _proficiency(str(requirement.get("raw", "")))
        candidates = [item for item in languages if _language_code(item.get("languageCode")) == code]
        levels = [_proficiency(str(item.get("proficiency") or "")) for item in candidates]
        if candidates and (minimum is None or any(
            level is not None and level[0] == minimum[0] and level[1] >= minimum[1]
            for level in levels
        )):
            satisfied += 1
            matched.add(code)
        elif minimum is not None and not any(level and level[0] == minimum[0] for level in levels):
            unverified += 1
    return {
        "applicable": bool(requirements),
        "score": satisfied / len(requirements) if requirements else 0.0,
        "requiredCodes": sorted(required_codes),
        "actualCodes": sorted(actual_codes),
        "matchedCodes": sorted(matched),
        "dataAvailable": bool(actual_codes),
        "proficiencyEvaluated": True,
        "unverifiedRequirements": unverified,
    }


def _proficiency(value: str) -> tuple[str, float] | None:
    for scale, pattern in (("IELTS", r"\bIELTS\s*(\d(?:\.\d)?)\b"),
                           ("TOEIC", r"\bTOEIC\s*(\d{2,3})\b")):
        match = re.search(pattern, value, re.I)
        if match:
            return scale, float(match.group(1))
    match = re.search(r"\b(A1|A2|B1|B2|C1|C2)\b", value, re.I)
    if match:
        return "CEFR", float(("A1", "A2", "B1", "B2", "C1", "C2").index(match.group(1).upper()))
    match = re.search(r"\bN([1-5])\b", value, re.I)
    return ("JLPT", float(6 - int(match.group(1)))) if match else None


def _normalized_requirement(item: dict[str, Any]) -> str:
    return _normalize_text(item.get("normalizedValue") or item.get("raw"))


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").casefold().strip().split())


def _language_code(value: Any) -> str:
    normalized = _normalize_text(value)
    return _LANGUAGE_ALIASES.get(normalized, normalized.split("-", 1)[0])


def _values_match(required: str, actual: str) -> bool:
    return required == actual or (len(required) >= 4 and (required in actual or actual in required))
