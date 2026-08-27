from __future__ import annotations

import re
from uuid import UUID, uuid5

from app.taxonomy.normalizer import extract_known_skills, taxonomy_version


_EVIDENCE_NAMESPACE = UUID("6d3d1b4f-1d29-4eaa-8a8f-bcc2a66f7ce4")
_PREFERRED_MARKERS = ("nice to have", "preferred", "ưu tiên", "lợi thế", "điểm cộng")


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
    required_skills, preferred_skills = _skills(job_version_id, title, description, requirements_text)
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
    if not required_skills and not preferred_skills:
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
            "parserVersion": f"rules-v0.2.0+taxonomy-{taxonomy_version()}",
        },
        "title": {
            "raw": title.strip(),
            "canonicalFamily": family,
            "level": level,
            "confidence": 0.85 if family or level else 0.55,
            "evidenceIds": [title_evidence],
        },
        "requirements": {
            "requiredSkills": required_skills,
            "preferredSkills": preferred_skills,
            "minimumRelevantExperienceMonths": _minimum_months(combined, ""),
            "education": [],
            "languages": [],
        },
        "responsibilities": responsibilities,
        "overallConfidence": 0.78 if (required_skills or preferred_skills) and responsibilities else 0.45,
        "qualityFlags": quality_flags,
    }


def _skills(job_version_id: str, title: str, description: str,
            requirements_text: str) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    required: list[dict[str, object]] = []
    preferred: list[dict[str, object]] = []
    seen: set[str] = set()
    preferred_mode = False
    lines = [title, description, *requirements_text.splitlines()]
    for line_number, line in enumerate(lines, start=1):
        lowered = line.casefold().strip()
        if not lowered:
            continue
        if any(marker in lowered for marker in _PREFERRED_MARKERS):
            preferred_mode = True
        if any(marker in lowered for marker in ("required", "must have", "bắt buộc", "yêu cầu chính")):
            preferred_mode = False
        for skill in extract_known_skills(line):
            if skill.stable_id in seen:
                continue
            seen.add(skill.stable_id)
            item = {
                "raw": skill.raw,
                "canonicalSkillId": skill.stable_id,
                "normalizationStatus": "KNOWN",
                "criticality": "NORMAL" if preferred_mode else "CRITICAL",
                "minimumMonths": _minimum_months(requirements_text, skill.raw),
                "evidenceIds": [str(uuid5(
                    _EVIDENCE_NAMESPACE,
                    f"{job_version_id}:skill:{skill.stable_id}:line:{line_number}",
                ))],
                "confidence": 0.94,
                "confirmedByRecruiter": False,
            }
            (preferred if preferred_mode else required).append(item)
    return required, preferred


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
