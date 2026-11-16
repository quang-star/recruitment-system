from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from app.shared.identities import JOB_SKILL_ID_MIN, parse_id
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import math
import re
from typing import Any

from app.extraction.skill_proposals import skill_name_key
from app.taxonomy.roles import SENIORITY_ORDER, role_family, role_level


ALGORITHM_VERSION = "baseline-v7"
PENALTY_VERSION = "penalty-v1"

_MAX_CRITICAL_PENALTY = 15.0
_STOPWORDS = frozenset({
    "and", "for", "with", "from", "that", "this", "into", "using", "build", "work",
    "have", "will", "able", "team", "các", "của", "cho", "với", "trên", "trong",
    "được", "những", "nhiều", "việc", "làm", "kinh", "nghiệm",
})

# Higher degrees satisfy lower degree requirements; field-of-study values are matched as text.
_DEGREE_RANK = {"high_school": 0, "vocational": 1, "associate": 2,
                "bachelor": 3, "master": 4, "doctorate": 5}


_LANGUAGE_ALIASES = {
    "english": "en", "tiếng anh": "en", "tieng anh": "en",
    "vietnamese": "vi", "tiếng việt": "vi", "tieng viet": "vi",
    "french": "fr", "tiếng pháp": "fr", "tieng phap": "fr",
    "german": "de", "tiếng đức": "de", "tieng duc": "de",
    "japanese": "ja", "tiếng nhật": "ja", "tieng nhat": "ja",
    "korean": "ko", "tiếng hàn": "ko", "tieng han": "ko",
    "chinese": "zh", "tiếng trung": "zh", "tieng trung": "zh",
}
_LANGUAGE_MENTIONS: dict[str, re.Pattern[str]] = {
    code: re.compile(r"(?<!\w)(?:" + "|".join(
        re.escape(alias) for alias in sorted(
            (alias for alias, alias_code in _LANGUAGE_ALIASES.items() if alias_code == code),
            key=len, reverse=True,
        )
    ) + r")(?!\w)")
    for code in sorted(set(_LANGUAGE_ALIASES.values()))
}


@dataclass(frozen=True, slots=True)
class MatchResult:
    status: str
    final_score: float
    quality_flags: list[str]
    components: list[dict[str, Any]]
    claims: list[dict[str, Any]]
    penalty: float = 0.0
    penalty_version: str = PENALTY_VERSION
    confidence: float = 0.0


def compute_match(cv_payload: dict[str, Any], jd_payload: dict[str, Any], *,
                  as_of_month: str | None = None,
                  responsibility_similarity_fn: Callable[[list[str], list[str]], float] | None = None) -> MatchResult:
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
        grounded = any(location.get("id") in ids for location in cv_payload.get("evidence") or [])
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
        cv_ev_ids = sorted(set(cv_items.get(skill_id, {}).get("evidenceIds", [])))
        cv_locs = _locations(cv_payload.get("evidence"), cv_ev_ids)
        jd_ev_ids = sorted(set(jd_item.get("evidenceIds", [])))
        jd_locs = _locations(jd_payload.get("evidence"), jd_ev_ids)
        limitation = (
            "NOT_FOUND_IN_CV" if claim_type == "MISSING"
            else "USER_ASSERTED_NO_EVIDENCE" if claim_type == "UNCERTAIN"
            else (None if cv_locs else "CV_OFFSET_UNAVAILABLE")
        )
        claims.append({
            "type": claim_type,
            "component": "REQUIRED_SKILLS",
            "subject": "JOB_REQUIRED_SKILL" if skill_id in job_items else "REQUIRED_SKILL",
            "skillId": skill_id,
            "label": str(jd_item.get("raw") or skill_id),
            "cvEvidenceIds": cv_ev_ids,
            "jdEvidenceIds": jd_ev_ids,
            "jdConfirmedByRecruiter": bool(jd_item.get("confirmedByRecruiter")),
            "cvLocations": cv_locs,
            "jdLocations": jd_locs,
            "limitationCode": limitation,
        })

    preferred_score = _ratio(preferred_hits, preferred)
    components.append(_component("PREFERRED_SKILLS", 15 if preferred else 0, preferred_score,
                                 {"matched": len(preferred_hits), "preferred": len(preferred),
                                  "jobScoped": len(preferred & job_items.keys())}))
    cv_experiences = list(cv_payload.get("experiences") or [])
    required_months = jd_payload.get("requirements", {}).get("minimumRelevantExperienceMonths")
    family = str(jd_payload.get("title", {}).get("canonicalFamily") or "OTHER").upper()
    experience_fact = _relevant_experience(cv_experiences, family, required, as_of_month)
    actual_months = experience_fact["actualMonths"]
    experience_applicable = required_months is not None
    experience_score = 1.0 if not required_months else min(1.0, actual_months / required_months)
    components.append(_component("EXPERIENCE", 15 if experience_applicable else 0, experience_score,
                                 {**experience_fact, "requiredMonths": required_months}))

    title = jd_payload.get("title", {})
    title_fact = _title_seniority_fact(title, family, cv_experiences)
    components.append(_component(
        "TITLE_SENIORITY",
        10 if title_fact["applicable"] else 0,
        title_fact["score"],
        {key: val for key, val in title_fact.items() if key not in {"applicable", "score", "seniorityUnverified"}},
    ))

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

    jd_responsibilities = list(jd_payload.get("responsibilities") or [])
    jd_resp_texts = [str(item.get("raw", "")).strip() for item in jd_responsibilities if str(item.get("raw", "")).strip()]
    cv_resp_texts = [str(item).strip() for exp in cv_experiences
                     for item in (exp.get("responsibilities") or []) if str(item).strip()]
    if responsibility_similarity_fn is not None and jd_resp_texts and cv_resp_texts:
        responsibility_score = max(0.0, min(1.0, float(responsibility_similarity_fn(jd_resp_texts, cv_resp_texts))))
        resp_method = "local-embedding-cosine-v1"
    else:
        responsibility_score = _ngram_cosine_similarity(jd_resp_texts, cv_resp_texts)
        resp_method = "tfidf-ngram-cosine-v1"
    components.append(_component("RESPONSIBILITY_SIMILARITY", 5 if jd_responsibilities else 0,
                                 responsibility_score,
                                 {"method": resp_method, "jdItems": len(jd_responsibilities),
                                  "cvExperiences": len(cv_experiences)}))

    applicable = [component for component in components if component["weight"] > 0]
    weight_total = sum(component["weight"] for component in applicable) or 1
    base_score = round(sum(component["contribution"] for component in applicable) / weight_total * 100, 2) if applicable else 0.0

    critical_required = [sid for sid, item in required_items.items()
                         if str(item.get("criticality") or "CRITICAL").upper() == "CRITICAL"]
    missing_critical = [sid for sid in critical_required
                        if sid not in cv_skills and sid not in unverified_cv_skills]
    penalty = (round(min(_MAX_CRITICAL_PENALTY, _MAX_CRITICAL_PENALTY * len(missing_critical) / len(critical_required)), 2)
               if applicable and critical_required and missing_critical else 0.0)
    final_score = round(max(0.0, min(100.0, base_score - penalty)), 2) if applicable else 0.0

    unresolved = [item for field in ("requiredSkills", "preferredSkills")
                  for item in jd_payload.get("requirements", {}).get(field, [])
                  if not item.get("canonicalSkillId") and _job_skill_id(item, job_version) is None]

    flags: list[str] = []
    if job_items:
        flags.append("JOB_SCOPED_SKILLS")
    if unresolved:
        flags.append("UNCONFIRMED_JOB_SKILLS")
    if experience_applicable and experience_fact["undatedRelevantJobs"]:
        flags.append("RELEVANT_EXPERIENCE_DATES_MISSING")
    if title_fact["seniorityUnverified"]:
        flags.append("CV_SENIORITY_UNVERIFIED")
    if language_fact.get("unverifiedRequirements"):
        flags.append("LANGUAGE_PROFICIENCY_UNVERIFIED")
    if not required:
        flags.append("NO_REQUIRED_SKILLS")
    if not cv_skills:
        flags.append("CV_SKILLS_UNAVAILABLE")
    if unverified_cv_skills & (required | preferred):
        flags.append("UNVERIFIED_SKILL_ASSERTIONS")
    if penalty > 0:
        flags.append("CRITICAL_REQUIREMENT_PENALTY")
    if any(component["score"] < 1 for component in applicable):
        flags.append("PARTIAL_REQUIREMENTS")
    if not applicable:
        flags.append("NO_APPLICABLE_COMPONENTS")

    confidence = _compute_confidence(
        applicable,
        required=required, cv_skills=cv_skills, unverified_cv_skills=unverified_cv_skills,
        unresolved=bool(unresolved), experience_fact=experience_fact,
        seniority_unverified=title_fact["seniorityUnverified"], language_fact=language_fact,
        has_cv_responsibilities=bool(cv_resp_texts),
    )

    claims.extend(_component_claims(
        components=components,
        cv_payload=cv_payload, jd_payload=jd_payload,
        preferred_items=preferred_items, preferred_hits=preferred_hits, cv_items=cv_items,
        cv_experiences=cv_experiences, family=family, required=required,
        title_fact=title_fact, experience_fact=experience_fact,
        language_fact=language_fact, resp_method=resp_method,
    ))

    # Without required skills (or CV skills) the score rests on weak signals such as
    # the title alone, so it must not be presented as a complete assessment.
    return MatchResult(
        status=("INSUFFICIENT_DATA" if not applicable
                else "DEGRADED" if unresolved or not required or not cv_skills
                else "COMPLETED"),
        final_score=final_score,
        quality_flags=flags, components=components, claims=claims,
        penalty=penalty, penalty_version=PENALTY_VERSION, confidence=confidence,
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


def _locations(evidence: Any, target_ids: list[str] | set[str]) -> list[dict[str, Any]]:
    if not evidence or not target_ids:
        return []
    wanted = set(target_ids)
    return [loc for loc in evidence if isinstance(loc, dict) and loc.get("id") in wanted]


def _collect_evidence_ids(items: Any) -> list[str]:
    if not items:
        return []
    ids = {str(eid) for item in items if isinstance(item, dict) for eid in (item.get("evidenceIds") or []) if eid}
    return sorted(ids)


def _role_family(item: dict[str, Any]) -> str:
    return role_family(item.get("titleCanonical") or item.get("titleRaw"))


def _experience_level(item: dict[str, Any]) -> str | None:
    raw = item.get("level")
    if isinstance(raw, str) and raw.strip().upper() in SENIORITY_ORDER:
        return raw.strip().upper()
    return role_level(item.get("titleRaw")) or role_level(item.get("titleCanonical"))


def _title_seniority_fact(title: dict[str, Any], family: str, cv_experiences: list[dict[str, Any]]) -> dict[str, Any]:
    raw_level = title["level"] if "level" in title else role_level(title.get("raw"))
    jd_level = str(raw_level).strip().upper() if isinstance(raw_level, str) and raw_level.strip() else None
    if jd_level not in SENIORITY_ORDER:
        jd_level = None
    applicable = (family != "OTHER") or (jd_level is not None)
    matched_jobs = [item for item in cv_experiences if family != "OTHER" and _role_family(item) == family]
    family_matched = bool(matched_jobs) if family != "OTHER" else False
    pool = matched_jobs if family != "OTHER" else cv_experiences
    candidate_levels = [lvl for lvl in (_experience_level(item) for item in pool) if lvl]
    best_cv_level = (
        max(candidate_levels, key=lambda lvl: SENIORITY_ORDER[lvl])
        if candidate_levels
        else max(
            (lvl for lvl in (_experience_level(item) for item in cv_experiences) if lvl),
            key=lambda lvl: SENIORITY_ORDER[lvl],
            default=None,
        )
    )
    seniority_score: float | None = None
    seniority_unverified = False
    if jd_level is not None:
        matched_levels = [lvl for lvl in (_experience_level(item) for item in pool) if lvl]
        if matched_levels:
            best_pool_level = max(matched_levels, key=lambda lvl: SENIORITY_ORDER[lvl])
            gap = SENIORITY_ORDER[jd_level] - SENIORITY_ORDER[best_pool_level]
            seniority_score = 1.0 if gap <= 0 else (0.5 if gap == 1 else 0.25)
            best_cv_level = best_pool_level
        else:
            seniority_score = 0.0 if (family != "OTHER" and not family_matched) or not cv_experiences else 0.5
            seniority_unverified = bool(pool)
        score = seniority_score if family == "OTHER" else (0.0 if not family_matched else round(0.6 + 0.4 * seniority_score, 4))
    else:
        score = float(family_matched)
    return {
        "applicable": applicable,
        "score": score,
        "family": family,
        "familyMatched": family_matched,
        "jdLevel": jd_level,
        "cvLevel": best_cv_level,
        "seniorityEvaluated": True,
        "seniorityScore": seniority_score,
        "seniorityUnverified": seniority_unverified,
    }


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
                or required.intersection(job.get("skillIds") or [])):
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


def _ngram_vector(texts: list[str]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for text in texts:
        tokens = [
            tok for tok in re.findall(r"[\w+#.-]{2,}", text.casefold())
            if tok not in _STOPWORDS and not tok.isdigit()
        ]
        for tok in tokens:
            counts[tok] += 1
        for i in range(len(tokens) - 1):
            counts[f"{tokens[i]}::{tokens[i + 1]}"] += 1
    return counts


def _ngram_cosine_similarity(jd_texts: list[str], cv_texts: list[str]) -> float:
    if not jd_texts or not cv_texts:
        return 0.0
    jd_counts = _ngram_vector(jd_texts)
    cv_counts = _ngram_vector(cv_texts)
    if not jd_counts or not cv_counts:
        return 0.0
    jd_vec = {term: 1.0 + math.log(count) for term, count in jd_counts.items()}
    cv_vec = {term: 1.0 + math.log(count) for term, count in cv_counts.items()}
    shared = set(jd_vec) & set(cv_vec)
    if not shared:
        return 0.0
    dot = sum(jd_vec[term] * cv_vec[term] for term in shared)
    norm_jd = math.sqrt(sum(v * v for v in jd_vec.values()))
    norm_cv = math.sqrt(sum(v * v for v in cv_vec.values()))
    return round(dot / (norm_jd * norm_cv), 4) if norm_jd and norm_cv else 0.0


def _compute_confidence(
    applicable: list[dict[str, Any]], *,
    required: set[str], cv_skills: set[str], unverified_cv_skills: set[str],
    unresolved: bool, experience_fact: dict[str, Any], seniority_unverified: bool,
    language_fact: dict[str, Any], has_cv_responsibilities: bool,
) -> float:
    if not applicable:
        return 0.0
    reliability: dict[str, float] = {
        "REQUIRED_SKILLS": (
            (0.5 if not cv_skills else 1.0)
            * max(0.4, 1.0 - 0.25 * (len(required & unverified_cv_skills) / max(1, len(required))) - (0.15 if unresolved else 0.0))
        ),
        "PREFERRED_SKILLS": 0.5 if not cv_skills else 1.0,
        "EXPERIENCE": (
            1.0 if not experience_fact["relevantJobs"]
            else max(0.35, 1.0 - 0.65 * (experience_fact["undatedRelevantJobs"] / experience_fact["relevantJobs"]))
        ),
        "TITLE_SENIORITY": 0.75 if seniority_unverified else 1.0,
        "EDUCATION_LANGUAGE": 0.7 if language_fact.get("unverifiedRequirements") else 1.0,
        "RESPONSIBILITY_SIMILARITY": 0.85 if has_cv_responsibilities else 0.4,
    }
    total_w = sum(comp["weight"] for comp in applicable) or 1
    weighted = sum(comp["weight"] * reliability.get(comp["name"], 1.0) for comp in applicable) / total_w
    if not required:
        weighted *= 0.55
    elif not cv_skills:
        weighted *= 0.65
    return round(max(0.0, min(1.0, weighted)), 2)


def _component_claim_type(score: float) -> str:
    return "COMPONENT_SUPPORTED" if score >= 0.8 else ("COMPONENT_PARTIAL" if score > 0 else "COMPONENT_MISSING")


def _component_claims(
    *, components: list[dict[str, Any]], cv_payload: dict[str, Any], jd_payload: dict[str, Any],
    preferred_items: dict[str, dict[str, Any]], preferred_hits: set[str], cv_items: dict[str, dict[str, Any]],
    cv_experiences: list[dict[str, Any]], family: str, required: set[str],
    title_fact: dict[str, Any], experience_fact: dict[str, Any],
    language_fact: dict[str, Any], resp_method: str,
) -> list[dict[str, Any]]:
    by_name = {comp["name"]: comp for comp in components}
    cv_ev_all = cv_payload.get("evidence")
    jd_ev_all = jd_payload.get("evidence")
    out: list[dict[str, Any]] = []

    def emit(name: str, label: str, cv_ids: list[str], jd_ids: list[str], limitation: str | None) -> None:
        comp = by_name.get(name)
        if not comp or comp["weight"] <= 0:
            return
        cv_locs = _locations(cv_ev_all, cv_ids)
        out.append({
            "type": _component_claim_type(float(comp["score"])),
            "component": name,
            "subject": "COMPONENT_CRITERION",
            "label": label,
            "cvEvidenceIds": cv_ids,
            "jdEvidenceIds": jd_ids,
            "cvLocations": cv_locs,
            "jdLocations": _locations(jd_ev_all, jd_ids),
            "limitationCode": limitation or (None if cv_ids else "NO_CV_EVIDENCE"),
        })

    if by_name.get("PREFERRED_SKILLS", {}).get("weight", 0) > 0:
        pref_cv_ids = _collect_evidence_ids([cv_items[sid] for sid in preferred_hits if sid in cv_items])
        pref_jd_ids = _collect_evidence_ids(preferred_items.values())
        emit(
            "PREFERRED_SKILLS",
            f"Đáp ứng {len(preferred_hits)}/{len(preferred_items)} kỹ năng ưu tiên",
            pref_cv_ids, pref_jd_ids,
            None if len(preferred_hits) == len(preferred_items) else "PARTIAL_PREFERRED_MATCH",
        )

    if by_name.get("EXPERIENCE", {}).get("weight", 0) > 0:
        relevant_jobs = [
            job for job in cv_experiences
            if (family != "OTHER" and _role_family(job) == family) or required.intersection(job.get("skillIds") or [])
        ]
        exp_cv_ids = _collect_evidence_ids(relevant_jobs)
        req_months = by_name["EXPERIENCE"]["details"].get("requiredMonths")
        emit(
            "EXPERIENCE",
            f"Kinh nghiệm liên quan {experience_fact['actualMonths']}/{req_months} tháng",
            exp_cv_ids, [],
            "EXPERIENCE_DATES_MISSING" if experience_fact["undatedRelevantJobs"] else ("NO_JD_EXPERIENCE_OFFSET" if not exp_cv_ids else None),
        )

    if by_name.get("TITLE_SENIORITY", {}).get("weight", 0) > 0:
        title_jobs = [job for job in cv_experiences if (family != "OTHER" and _role_family(job) == family) or family == "OTHER"]
        title_cv_ids = _collect_evidence_ids(title_jobs)
        title_jd_ids = sorted({str(eid) for eid in (jd_payload.get("title", {}).get("evidenceIds") or []) if eid})
        lvl_note = f" · cấp {title_fact['jdLevel']}" if title_fact.get("jdLevel") else ""
        emit(
            "TITLE_SENIORITY",
            f"Chức danh nhóm {family}{lvl_note}",
            title_cv_ids, title_jd_ids,
            "CV_SENIORITY_UNVERIFIED" if title_fact["seniorityUnverified"] else None,
        )

    if by_name.get("EDUCATION_LANGUAGE", {}).get("weight", 0) > 0:
        edu_lang_cv_ids = _collect_evidence_ids(list(cv_payload.get("education") or []) + list(cv_payload.get("languages") or []))
        reqs = jd_payload.get("requirements", {})
        edu_lang_jd_ids = _collect_evidence_ids(list(reqs.get("education") or []) + list(reqs.get("languages") or []))
        emit(
            "EDUCATION_LANGUAGE",
            "Đáp ứng yêu cầu học vấn và ngoại ngữ",
            edu_lang_cv_ids, edu_lang_jd_ids,
            "LANGUAGE_PROFICIENCY_UNVERIFIED" if language_fact.get("unverifiedRequirements") else None,
        )

    if by_name.get("RESPONSIBILITY_SIMILARITY", {}).get("weight", 0) > 0:
        resp_jobs = [job for job in cv_experiences if job.get("responsibilities")]
        resp_cv_ids = _collect_evidence_ids(resp_jobs)
        resp_jd_ids = _collect_evidence_ids(jd_payload.get("responsibilities"))
        limitation = "LEXICAL_NGRAM_SIMILARITY_ONLY" if resp_method == "tfidf-ngram-cosine-v1" else None
        emit(
            "RESPONSIBILITY_SIMILARITY",
            "Tương đồng trách nhiệm công việc",
            resp_cv_ids, resp_jd_ids,
            limitation,
        )

    return out


def _is_required(item: dict[str, Any]) -> bool:
    # Legacy payloads have no flag; only an explicit ``required: false`` marks a preference.
    return item.get("required") is not False


def _education_fact(requirements: list[dict[str, Any]], education: list[dict[str, Any]]) -> dict[str, Any]:
    required_values = {_normalized_requirement(item) for item in requirements if _is_required(item)}
    required_values.discard("")
    preferred_values = {_normalized_requirement(item) for item in requirements
                        if not _is_required(item)} - required_values
    preferred_values.discard("")
    actual_values = {
        normalized
        for item in education
        for normalized in (_normalize_text(item.get("degreeLevel")), _normalize_text(item.get("fieldOfStudy")))
        if normalized
    }
    actual_rank = max((_DEGREE_RANK[value] for value in actual_values if value in _DEGREE_RANK), default=None)

    def satisfied(required: str) -> bool:
        rank = _DEGREE_RANK.get(required)
        if rank is not None:
            return actual_rank is not None and actual_rank >= rank
        return any(_values_match(required, actual) for actual in actual_values)

    matched = sorted(value for value in required_values if satisfied(value))
    return {
        "applicable": bool(required_values),
        "score": _ratio(set(matched), required_values),
        "requiredValues": sorted(required_values),
        "preferredValues": sorted(preferred_values),
        "preferredMatchedValues": sorted(value for value in preferred_values if satisfied(value)),
        "actualValues": sorted(actual_values),
        "matchedValues": matched,
        "dataAvailable": bool(actual_values),
        "degreeOrderEvaluated": True,
    }


def _language_fact(requirements: list[dict[str, Any]], languages: list[dict[str, Any]]) -> dict[str, Any]:
    actual_codes = {_language_code(item.get("languageCode")) for item in languages}
    actual_codes.discard("")
    outcomes: list[tuple[bool, str, str]] = []
    for requirement in requirements:
        code = _language_code(_normalized_requirement(requirement))
        if code:
            outcomes.append((_is_required(requirement), code,
                             _language_outcome(requirement, code, languages)))
    required = [(code, outcome) for is_required, code, outcome in outcomes if is_required]
    preferred = [(code, outcome) for is_required, code, outcome in outcomes if not is_required]
    satisfied = sum(outcome == "SATISFIED" for _, outcome in required)
    return {
        "applicable": bool(required),
        "score": satisfied / len(required) if required else 0.0,
        "requiredCodes": sorted({code for code, _ in required}),
        "preferredCodes": sorted({code for code, _ in preferred}),
        "preferredMatchedCodes": sorted({code for code, outcome in preferred if outcome == "SATISFIED"}),
        "actualCodes": sorted(actual_codes),
        "matchedCodes": sorted({code for code, outcome in required if outcome == "SATISFIED"}),
        "dataAvailable": bool(actual_codes),
        "proficiencyEvaluated": True,
        "unverifiedRequirements": sum(outcome == "UNVERIFIED" for _, outcome in required),
    }


def _language_outcome(requirement: dict[str, Any], code: str, languages: list[dict[str, Any]]) -> str:
    minimum = _proficiency(_language_segment(str(requirement.get("raw", "")), code))
    candidates = [item for item in languages if _language_code(item.get("languageCode")) == code]
    levels = [_proficiency(str(item.get("proficiency") or "")) for item in candidates]
    if candidates and (minimum is None or any(
        level is not None and level[0] == minimum[0] and level[1] >= minimum[1] for level in levels
    )):
        return "SATISFIED"
    if minimum is not None and not any(level and level[0] == minimum[0] for level in levels):
        return "UNVERIFIED"
    return "UNMET"


def _language_segment(raw: str, code: str) -> str:
    """Return the part of a requirement sentence that states this language's level.

    A sentence such as "English B2 or Japanese N3" yields one requirement per
    language; each must read the level next to its own language, not the first one.
    """
    text = raw.casefold()
    mentions = sorted((match.start(), match.end(), mention_code)
                      for mention_code, pattern in _LANGUAGE_MENTIONS.items()
                      for match in pattern.finditer(text))
    if len({mention_code for *_, mention_code in mentions}) < 2:
        return raw
    own = next((index for index, item in enumerate(mentions) if item[2] == code), None)
    if own is None:
        return raw
    start = mentions[own][0]
    following = next((begin for begin, _, other in mentions[own + 1:] if other != code), len(text))
    preceding = next((end for _, end, other in reversed(mentions[:own]) if other != code), 0)
    after = text[start:following]
    return after if _proficiency(after) is not None else text[preceding:start]


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
