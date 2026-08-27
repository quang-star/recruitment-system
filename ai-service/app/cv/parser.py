from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
import re
from uuid import UUID, uuid5

from pypdf import PdfReader

from app.cv.ocr import OcrProcessingError, OcrUnavailableError, extract_pdf_text
from app.taxonomy.normalizer import extract_known_skills, normalize_skill, taxonomy_version


_EVIDENCE_NAMESPACE = UUID("1509be16-4759-473b-b4db-6d90a94f5d41")
_TITLE_MARKERS: tuple[tuple[str, str], ...] = (
    ("backend", "BACKEND_DEVELOPER"),
    ("back-end", "BACKEND_DEVELOPER"),
    ("frontend", "FRONTEND_DEVELOPER"),
    ("front-end", "FRONTEND_DEVELOPER"),
    ("fullstack", "FULLSTACK_DEVELOPER"),
    ("full-stack", "FULLSTACK_DEVELOPER"),
    ("full stack", "FULLSTACK_DEVELOPER"),
    ("devops", "DEVOPS_ENGINEER"),
    ("data engineer", "DATA_ENGINEER"),
    ("data scientist", "DATA_SCIENTIST"),
    ("machine learning", "MACHINE_LEARNING_ENGINEER"),
    ("software engineer", "SOFTWARE_ENGINEER"),
    ("software developer", "SOFTWARE_DEVELOPER"),
    ("developer", "SOFTWARE_DEVELOPER"),
    ("engineer", "SOFTWARE_ENGINEER"),
)
_RESPONSIBILITY_MARKERS = (
    "develop", "build", "design", "implement", "maintain", "deploy", "test", "lead",
    "phát triển", "xây dựng", "thiết kế", "triển khai", "bảo trì", "kiểm thử", "quản lý",
)


def parse_pdf(cv_version_id: str, source_hash: str, content: bytes, *,
              ocr_enabled: bool = True, ocr_max_pages: int = 5,
              ocr_timeout_seconds: float = 60.0, ocr_extractor=extract_pdf_text) -> dict[str, object]:
    reader = PdfReader(BytesIO(content))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    text = "\n".join(value for value in pages if value).strip()
    extraction_method = "EMBEDDED_TEXT" if text else "NONE"
    ocr_flag: str | None = None
    if _text_signal(text) < 100:
        if not ocr_enabled:
            ocr_flag = "OCR_DISABLED"
        else:
            try:
                ocr_text = ocr_extractor(content, len(reader.pages), ocr_max_pages, ocr_timeout_seconds)
                if _text_signal(ocr_text) > _text_signal(text):
                    text = _repair_ocr_skill_spacing(ocr_text)
                    extraction_method = "OCR"
                else:
                    ocr_flag = "OCR_LOW_TEXT_SIGNAL"
            except OcrUnavailableError:
                ocr_flag = "OCR_UNAVAILABLE"
            except OcrProcessingError:
                ocr_flag = "OCR_FAILED"

    extracted_skills = extract_known_skills(text)
    extracted_confidence = 0.84 if extraction_method == "OCR" else 0.94
    skills = [
        {
            "raw": skill.raw,
            "canonicalSkillId": skill.stable_id,
            "normalizationStatus": "KNOWN",
            "evidenceIds": [str(uuid5(
                _EVIDENCE_NAMESPACE,
                f"{cv_version_id}:skill:{skill.stable_id}:{skill.start}",
            ))],
            "confidence": extracted_confidence,
            "provenance": "EXTRACTED",
        }
        for skill in extracted_skills
    ]
    title_raw, title_canonical = _title(text)
    responsibilities = _responsibilities(text, extracted_skills)
    start_month, end_month, is_current = _first_date_range(text)
    total_experience_months = _total_experience_months(text)
    experiences = []
    if title_raw:
        experiences.append({
            "titleRaw": title_raw,
            "titleCanonical": title_canonical,
            "companyRedacted": None,
            "startMonth": start_month,
            "endMonth": end_month,
            "isCurrent": is_current,
            "responsibilities": responsibilities,
            "skillIds": [skill.stable_id for skill in extracted_skills],
            "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{cv_version_id}:experience:1"))],
            "confidence": (0.62 if start_month else 0.48) if extraction_method == "OCR"
            else (0.72 if start_month else 0.58),
        })
    quality_flags: list[str] = []
    if extraction_method == "OCR":
        quality_flags.extend(("OCR_EXTRACTION", "OCR_REVIEW_REQUIRED"))
    if _text_signal(text) < 100:
        quality_flags.append("LOW_TEXT_SIGNAL")
        if extraction_method == "OCR":
            quality_flags.append("OCR_LOW_TEXT_SIGNAL")
        else:
            quality_flags.append("OCR_REQUIRED")
            if ocr_flag:
                quality_flags.append(ocr_flag)
    if not extracted_skills:
        quality_flags.append("NO_CANONICAL_SKILLS")
    if not experiences:
        quality_flags.append("NO_EXPERIENCE_DETAILS")
    if text and not quality_flags:
        quality_flags.append("RULE_BASED_EXTRACTION")
    return {
        "$schema": "https://smart-recruitment.local/contracts/schemas/parsed-cv-v1.schema.json",
        "schemaVersion": "parsed-cv/1.0",
        "document": {
            "cvVersionId": cv_version_id,
            "language": _language(text),
            "sourceHash": source_hash,
            "parserVersion": f"rules-v0.3.1+ocr-tesseract5+taxonomy-{taxonomy_version()}",
            "textExtractionMethod": extraction_method,
        },
        "skills": skills,
        "experiences": experiences,
        "projects": [],
        "education": [],
        "certificates": [],
        "languages": [],
        "summary": {
            "totalExperienceMonths": total_experience_months,
            "overallConfidence": 0.15 if not text else (
                (0.68 if skills else 0.32) if extraction_method == "OCR" else (0.78 if skills else 0.38)
            ),
            "qualityFlags": quality_flags,
        },
    }


def _text_signal(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


_OCR_SPLIT_WORD = re.compile(r"(?<!\w)([A-Za-z])([ \t]+)([A-Za-z]+)(?!\w)")
_OCR_SPLIT_WORD_REVERSED = re.compile(r"(?<!\w)([A-Za-z]+)([ \t]+)([A-Za-z])(?!\w)")


def _repair_ocr_skill_spacing(text: str) -> str:
    """Repair a narrow OCR artifact only when taxonomy proves the joined term.

    A scan can be recognized as ``J ava`` or ``Jav a``. Blindly removing spaces
    would corrupt ordinary prose, so only a two-token candidate with a one-letter
    fragment is joined, and only when that joined value is an exact taxonomy alias.
    """
    def replace(match: re.Match[str]) -> str:
        candidate = f"{match.group(1)}{match.group(3)}"
        if len(candidate) < 4:
            return match.group(0)
        normalized = normalize_skill(candidate)
        return normalized.canonical_name if normalized is not None else match.group(0)

    repaired = _OCR_SPLIT_WORD.sub(replace, text)
    return _OCR_SPLIT_WORD_REVERSED.sub(replace, repaired)


def _language(text: str) -> str:
    lowered = text.casefold()
    has_vi = any(character in lowered for character in "ăâđêôơư")
    has_en = bool(re.search(r"\b(?:and|with|experience|developer|engineer|skills?)\b", lowered))
    if has_vi and has_en:
        return "mixed"
    if has_vi:
        return "vi"
    return "en" if re.search(r"[a-zA-Z]{3}", text) else "unknown"


def _title(text: str) -> tuple[str | None, str | None]:
    lines = [line.strip(" -•\t") for line in text.splitlines() if line.strip(" -•\t")]
    for line in lines:
        lowered = line.casefold()
        for marker, canonical in _TITLE_MARKERS:
            if marker in lowered and len(line) <= 240:
                return line, canonical
    return None, None


def _responsibilities(text: str, skills) -> list[str]:
    results: list[str] = []
    skill_terms = {skill.raw.casefold() for skill in skills}
    for line in (value.strip(" -•\t") for value in text.splitlines()):
        lowered = line.casefold()
        if not line or len(line) > 1000:
            continue
        if any(marker in lowered for marker in _RESPONSIBILITY_MARKERS) \
                or (len(line.split()) >= 4 and any(term in lowered for term in skill_terms)):
            results.append(line)
        if len(results) == 8:
            break
    return results


_DATE_RANGE = re.compile(
    r"(?P<start>(?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}|(?:19|20)\d{2}[/.-](?:0?[1-9]|1[0-2])|(?:19|20)\d{2})"
    r"\s*(?:-|–|—|to|đến)\s*"
    r"(?P<end>(?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}|(?:19|20)\d{2}[/.-](?:0?[1-9]|1[0-2])|(?:19|20)\d{2}|present|current|nay|hiện tại)",
    re.IGNORECASE,
)


def _month(value: str, *, end: bool = False) -> tuple[int, int] | None:
    value = value.strip().casefold()
    if value in {"present", "current", "nay", "hiện tại"}:
        now = datetime.now(UTC)
        return now.year, now.month
    parts = re.split(r"[/.-]", value)
    if len(parts) == 1 and parts[0].isdigit():
        return int(parts[0]), 12 if end else 1
    if len(parts) != 2:
        return None
    first, second = (int(part) for part in parts)
    return (first, second) if first >= 1900 else (second, first)


def _month_string(value: tuple[int, int] | None) -> str | None:
    return f"{value[0]:04d}-{value[1]:02d}" if value else None


def _first_date_range(text: str) -> tuple[str | None, str | None, bool]:
    match = _DATE_RANGE.search(text)
    if match is None:
        return None, None, False
    current = match.group("end").casefold() in {"present", "current", "nay", "hiện tại"}
    return (
        _month_string(_month(match.group("start"))),
        None if current else _month_string(_month(match.group("end"), end=True)),
        current,
    )


def _total_experience_months(text: str) -> int:
    intervals: list[tuple[int, int]] = []
    for match in _DATE_RANGE.finditer(text):
        start = _month(match.group("start"))
        end = _month(match.group("end"), end=True)
        if start is None or end is None:
            continue
        start_value = start[0] * 12 + start[1] - 1
        end_value = end[0] * 12 + end[1] - 1
        if end_value < start_value or end_value - start_value > 600:
            continue
        intervals.append((start_value, end_value))
    if not intervals:
        explicit = re.search(r"(\d{1,2})\s*\+?\s*(?:years?|năm)\s+(?:of\s+)?experience", text, re.IGNORECASE)
        return int(explicit.group(1)) * 12 if explicit else 0
    months: set[int] = set()
    for start, end in intervals:
        months.update(range(start, end + 1))
    return len(months)
