from __future__ import annotations

import re
from uuid import UUID, uuid5


_EVIDENCE_NAMESPACE = UUID("6d3d1b4f-1d29-4eaa-8a8f-bcc2a66f7ce4")
_SKILLS: tuple[tuple[str, str, str, str], ...] = (
    ("java", "32af50d2-0649-589a-b10c-ee404cef802d", "Java", "BACKEND"),
    ("spring boot", "76240767-3058-5507-b6c3-3b16fc05bd8c", "Spring Boot", "BACKEND"),
    ("springboot", "76240767-3058-5507-b6c3-3b16fc05bd8c", "Spring Boot", "BACKEND"),
    ("python", "9da49ca9-8c3d-5eff-8d1b-f435385d1e96", "Python", "BACKEND"),
    ("fastapi", "7336682e-e97e-5349-bf01-2d9453c93c75", "FastAPI", "BACKEND"),
    ("javascript", "4eabcf91-c028-5bbf-a4d0-ce9add1fc447", "JavaScript", "FRONTEND"),
    ("ecmascript", "4eabcf91-c028-5bbf-a4d0-ce9add1fc447", "JavaScript", "FRONTEND"),
    ("kafka", "0c57728e-8343-5ef2-aa80-db3df230cc81", "Kafka", "BACKEND"),
    ("apache kafka", "0c57728e-8343-5ef2-aa80-db3df230cc81", "Kafka", "BACKEND"),
    ("postgresql", "b78e841d-2382-5635-88a2-b8bf0d969144", "PostgreSQL", "BACKEND"),
    ("postgres", "b78e841d-2382-5635-88a2-b8bf0d969144", "PostgreSQL", "BACKEND"),
    ("docker", "b69da65b-d915-5710-9703-a218935b7688", "Docker", "DEVOPS"),
    ("react", "d4f49f3b-a28e-5fd3-b558-94beba4054c0", "React", "FRONTEND"),
    ("reactjs", "d4f49f3b-a28e-5fd3-b558-94beba4054c0", "React", "FRONTEND"),
    ("react.js", "d4f49f3b-a28e-5fd3-b558-94beba4054c0", "React", "FRONTEND"),
)


def parse_jd(job_version_id: str, source_hash: str, title: str,
             description: str, requirements_text: str) -> dict[str, object]:
    """Create a conservative, contract-compatible ParsedJD baseline.

    The parser only emits a canonical skill when an exact taxonomy alias is found.
    Unknown terms are intentionally left out instead of inventing taxonomy IDs.
    """
    job_uuid = UUID(job_version_id)
    combined = f"{title}\n{description}\n{requirements_text}"
    lowered = combined.casefold()
    language = "vi" if any(character in lowered for character in "ăâđêôơư") else "en"
    family = _family(title)
    level = _level(title)
    title_evidence = str(uuid5(_EVIDENCE_NAMESPACE, f"{job_version_id}:title"))
    required_text = requirements_text or ""
    preferred_mode = any(marker in lowered for marker in ("nice to have", "preferred", "ưu tiên", "lợi thế"))
    skills = []
    seen_skills: set[str] = set()
    for alias, stable_id, canonical_name, _category in _SKILLS:
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", lowered):
            if stable_id in seen_skills:
                continue
            seen_skills.add(stable_id)
            skills.append({
                "raw": canonical_name,
                "canonicalSkillId": stable_id,
                "normalizationStatus": "KNOWN",
                "criticality": "NORMAL" if preferred_mode else "CRITICAL",
                "minimumMonths": _minimum_months(required_text, alias),
                "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{job_version_id}:skill:{alias}"))],
                "confidence": 0.92,
                "confirmedByRecruiter": False,
            })
    responsibilities = []
    for index, sentence in enumerate(_sentences(description), start=1):
        responsibilities.append({
            "raw": sentence[:1000],
            "normalizedValue": None,
            "required": True,
            "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{job_version_id}:responsibility:{index}"))],
            "confidence": 0.72,
            "confirmedByRecruiter": False,
        })
    quality_flags: list[str] = []
    if len(combined.strip()) < 120:
        quality_flags.append("LOW_TEXT_SIGNAL")
    if not skills:
        quality_flags.append("NO_CANONICAL_SKILLS")
    if not responsibilities:
        quality_flags.append("NO_RESPONSIBILITIES")
    return {
        "$schema": "https://smart-recruitment.local/contracts/schemas/parsed-jd-v1.schema.json",
        "schemaVersion": "parsed-jd/1.0",
        "document": {
            "jobVersionId": job_version_id,
            "language": language,
            "sourceHash": source_hash,
            "parserVersion": "rules-v0.1.0",
        },
        "title": {
            "raw": title.strip(),
            "canonicalFamily": family,
            "level": level,
            "confidence": 0.85 if family or level else 0.55,
            "evidenceIds": [title_evidence],
        },
        "requirements": {
            "requiredSkills": skills if not preferred_mode else [],
            "preferredSkills": skills if preferred_mode else [],
            "minimumRelevantExperienceMonths": _minimum_months(combined, ""),
            "education": [],
            "languages": [],
        },
        "responsibilities": responsibilities,
        "overallConfidence": 0.78 if skills and responsibilities else 0.45,
        "qualityFlags": quality_flags,
    }


def _sentences(value: str) -> list[str]:
    return [part.strip(" -•\t") for part in re.split(r"[\n.!?;]+", value) if part.strip(" -•\t")]


def _minimum_months(value: str, alias: str) -> int | None:
    if alias:
        match = re.search(rf"(\d+)\s*(?:\+\s*)?(?:năm|years?)\b[^\n,;.]{{0,80}}{re.escape(alias)}", value.casefold())
        if not match:
            match = re.search(rf"{re.escape(alias)}[^\n,;.]{{0,80}}(\d+)\s*(?:năm|years?)\b", value.casefold())
    else:
        match = re.search(r"(\d+)\s*(?:\+\s*)?(?:năm|years?)\b", value.casefold())
    return int(match.group(1)) * 12 if match else None


def _family(title: str) -> str:
    lowered = title.casefold()
    for marker, family in (("backend", "BACKEND"), ("front-end", "FRONTEND"), ("frontend", "FRONTEND"),
                           ("fullstack", "FULLSTACK"), ("full stack", "FULLSTACK"), ("mobile", "MOBILE"),
                           ("devops", "DEVOPS"), ("data", "DATA_AI"), ("qa", "QA"), ("security", "SECURITY")):
        if marker in lowered:
            return family
    return "OTHER"


def _level(title: str) -> str | None:
    lowered = title.casefold()
    for marker, level in (("intern", "INTERN"), ("fresher", "FRESHER"), ("junior", "JUNIOR"),
                          ("middle", "MIDDLE"), ("mid-level", "MIDDLE"), ("senior", "SENIOR"),
                          ("lead", "LEAD"), ("manager", "MANAGER")):
        if marker in lowered:
            return level
    return None
