from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
import re
from typing import Any
from uuid import UUID, uuid5

from pypdf import PdfReader

from app.cv.ocr import OcrProcessingError, OcrUnavailableError, extract_pdf_text
from app.taxonomy.normalizer import extract_known_skills, normalize_skill, taxonomy_version
from app.shared.evidence import attach_source_evidence, skill_locations
from app.shared.skill_proposals import propose_skill, skill_name_key


PARSER_VERSION = "rules-v0.5.4+ocr-tesseract5"
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
_EXPERIENCE_SECTION_HEADINGS = frozenset({
    "experience", "work experience", "working experience", "work experiences",
    "professional experience", "professional experiences", "employment experience",
    "employment history", "career history", "work history", "kinh nghiệm",
    "kinh nghiệm làm việc", "kinh nghiệm công việc", "kinh nghiem",
    "kinh nghiem lam viec", "kinh nghiem cong viec", "quá trình công tác", "qua trinh cong tac",
})
_EDUCATION_SECTION_HEADINGS = frozenset({
    "education", "education and training", "educational background",
    "academic background", "academic qualifications", "qualifications", "học vấn", "hoc van",
    "giáo dục", "giao duc",
})
_LANGUAGE_SECTION_HEADINGS = frozenset({
    "languages", "language", "ngôn ngữ", "ngon ngu", "ngoại ngữ", "ngoai ngu",
})
_NON_EXPERIENCE_SECTION_HEADINGS = frozenset({
    *_EDUCATION_SECTION_HEADINGS, *_LANGUAGE_SECTION_HEADINGS,
    "projects", "personal projects", "dự án", "du an",
    "certificates", "certifications", "chứng chỉ", "chung chi", "skills",
    "technical skills", "kỹ năng", "ky nang",
    "summary", "profile", "objective", "mục tiêu", "muc tieu", "awards",
    "activities", "hoạt động", "hoat dong", "references", "người tham chiếu",
})


def parse_pdf(cv_version_id: str, source_hash: str, content: bytes, *,
              ocr_enabled: bool = True, ocr_max_pages: int = 5,
              ocr_timeout_seconds: float = 60.0, ocr_extractor=extract_pdf_text,
              enricher=None) -> dict[str, object]:
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
    experience_text = _experience_text(text)
    total_experience_months = _total_experience_months(text)
    source_pages = pages if extraction_method == "EMBEDDED_TEXT" else None
    evidence = skill_locations(text, skills, source_pages)
    skills_section = _section_text(text, frozenset({"skills", "technical skills", "kỹ năng", "ky nang"}))
    source_section = _section_source(text, frozenset({"skills", "technical skills", "kỹ năng", "ky nang"}))
    seen_skill_names = {skill_name_key(skill.raw) for skill in extracted_skills}
    for raw in re.split(r"[,;|•\n]", skills_section)[:60]:
        name = raw.strip(" -\t")
        if not name or len(name.split()) > 5 or skill_name_key(name) in seen_skill_names \
                or extract_known_skills(name):
            continue
        try:
            proposed = propose_skill(name, cv_version_id, text, kind="cv", pages=source_pages,
                                     clauses=[source_section] if source_section else None)
        except ValueError:
            continue
        if proposed is not None:
            item, location = proposed
            item["provenance"] = "EXTRACTED"
            item["confidence"] = 0.65 if extraction_method == "OCR" else 0.7
            skills.append(item)
            evidence.append(location)
            seen_skill_names.add(skill_name_key(name))
    experiences = _experiences(cv_version_id, experience_text, extraction_method,
                               evidence=evidence, source_text=text, pages=source_pages)
    education = _education(cv_version_id, text, extraction_method, evidence=evidence, pages=source_pages)
    languages = _languages(cv_version_id, text, extraction_method, evidence=evidence, pages=source_pages)
    projects = _projects(cv_version_id, text, evidence=evidence, pages=source_pages)
    certificates = _certificates(cv_version_id, text, evidence=evidence, pages=source_pages)
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
    if any(item["canonicalSkillId"] is None for item in skills):
        quality_flags.append("UNNORMALIZED_SKILLS")
    if not experiences:
        quality_flags.append("NO_EXPERIENCE_DETAILS")
    if any(not item["evidenceIds"] for group in (experiences, education, languages, projects, certificates)
           for item in group):
        quality_flags.append("PARTIAL_SOURCE_EVIDENCE")
    if text and not quality_flags:
        quality_flags.append("RULE_BASED_EXTRACTION")
    payload: dict[str, Any] = {
        "$schema": "https://smart-recruitment.local/contracts/schemas/parsed-cv-v2.schema.json",
        "schemaVersion": "parsed-cv/2.0",
        "document": {
            "cvVersionId": cv_version_id,
            "language": _language(text),
            "sourceHash": source_hash,
            "taxonomyVersion": taxonomy_version(),
            "parserVersion": f"{PARSER_VERSION}+taxonomy-{taxonomy_version()}",
            "textExtractionMethod": extraction_method,
        },
        "skills": skills,
        "evidence": evidence,
        "experiences": experiences,
        "projects": projects,
        "education": education,
        "certificates": certificates,
        "languages": languages,
        "summary": {
            "totalExperienceMonths": total_experience_months,
            "overallConfidence": 0.15 if not text else (
                (0.68 if skills else 0.32) if extraction_method == "OCR" else (0.78 if skills else 0.38)
            ),
            "qualityFlags": quality_flags,
        },
    }
    return enricher("cv", text, payload) if enricher is not None else payload


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
    # A common Latin-1 decoding artifact prefixes bullets/NBSP with U+00C2.
    # It must not be treated as Vietnamese text merely because it contains Â.
    lowered = re.sub("\u00c2(?=[\u00a0-\u00bf])", "", text).casefold()
    # Technical acronyms in a Chinese resume do not establish English support.
    # The contract has no Chinese document language; retain the review state.
    cjk_count = len(re.findall(r"[\u4e00-\u9fff]", lowered))
    latin_count = len(re.findall(r"[a-z]", lowered))
    if cjk_count >= 20 and cjk_count > latin_count:
        return "unknown"
    has_vi = bool(re.search(r"[ăâđêôơư\u1ea0-\u1ef9]", lowered))
    has_en = bool(re.search(r"\b(?:and|with|experience|developer|engineer|skills?)\b", lowered))
    if has_vi and has_en:
        return "mixed"
    if has_vi:
        return "vi"
    return "en" if re.search(r"[a-zA-Z]{3}", text) else "unknown"


def _title(text: str) -> tuple[str | None, str | None]:
    lines = [line.strip(" -•\t") for line in text.splitlines() if line.strip(" -•\t")]
    for line in lines:
        line = _DATE_RANGE.sub("", line).strip(" -–—|,\t")
        lowered = line.casefold()
        # A responsibility mentioning a role is not an employment title.
        # Keep actual titles such as Lead Developer and Support Engineer.
        if re.match(
            r"(?:develop(?:s|ed|ing)?|build(?:s|ing)?|built|design(?:s|ed|ing)?(?!\s+engineer\b)|implement\w*|maintain\w*|"
            r"deploy\w*|collaborat\w*|work\w*|assist\w*|provid\w*|responsible|served|"
            r"phát triển|xây dựng|thiết kế|triển khai|bảo trì|tham gia|hỗ trợ)\s",
            lowered,
        ):
            continue
        for marker, canonical in _TITLE_MARKERS:
            if re.search(rf"(?<!\w){re.escape(marker)}(?!\w)", lowered) and len(line) <= 240:
                return line, canonical
        # Preserve supported raw job titles even when there is no canonical
        # software role. Do not map IT support/analyst roles to software engineer.
        if len(line) <= 120 and len(line.split()) <= 12 and re.search(
            r"\b(?:technician|administrator|analyst|specialist|manager|liaison|consultant|architect|coordinator|director|tester|leader|engineering|president)\b", lowered,
        ) and not re.match(
            r"(?:[-•·]|develop(?:s|ed|ing)?|build(?:s|ing)?|design(?:s|ed|ing)?|implement\w*|maintain\w*|"
            r"support\w*|manage\w*|collaborat\w*|work\w*|assist\w*|provid\w*|"
            r"responsible|served|\w+ing)\s", lowered,
        ):
            return line, None
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


_MONTH_NAMES = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)
_NAMED_MONTH = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
_DATE_TOKEN = (
    rf"{_NAMED_MONTH}\.?\s+(?:19|20)\d{{2}}|"
    r"(?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}|"
    r"(?:19|20)\d{2}[/.-](?:0?[1-9]|1[0-2])|(?:19|20)\d{2}"
)
_DATE_RANGE = re.compile(
    rf"(?<!\d)(?P<start>{_DATE_TOKEN})"
    r"\s*(?:-|–|—|to|đến)\s*"
    rf"(?P<end>{_DATE_TOKEN}|present|current|nay|hiện tại)(?!\w)",
    re.IGNORECASE,
)


def _month(value: str, *, end: bool = False) -> tuple[int, int] | None:
    value = value.strip().casefold()
    if value in {"present", "current", "nay", "hiện tại"}:
        now = datetime.now(UTC)
        return now.year, now.month
    named = re.fullmatch(rf"({_NAMED_MONTH})\.?\s+((?:19|20)\d{{2}})", value, re.I)
    if named:
        month = next(index for index, name in enumerate(_MONTH_NAMES, 1)
                     if name.startswith(named.group(1)[:3]))
        return int(named.group(2)), month
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


def _heading_key(line: str) -> str:
    value = line.strip(" -•\t:#|").casefold()
    return re.sub(r"\s+", " ", value)


def _experience_text(text: str) -> str:
    """Return text belonging to explicit work-history sections when headings exist.

    CVs without recognizable section headings keep the previous whole-text fallback.
    Once a known heading is present, education/project/certificate dates are excluded
    and only content under work-experience headings is eligible for duration parsing.
    """
    captured: list[str] = []
    in_experience = False
    saw_known_heading = False
    lines = _expand_inline_headings(text).splitlines()
    for index, line in enumerate(lines):
        heading = _heading_key(line)
        if heading in _EXPERIENCE_SECTION_HEADINGS:
            saw_known_heading = True
            in_experience = True
            continue
        if heading in _NON_EXPERIENCE_SECTION_HEADINGS:
            # Some PDF resumes use a bulleted Summary subsection within a job.
            following = next((value.strip() for value in lines[index + 1:] if value.strip()), "")
            if in_experience and heading == "summary" and following.removeprefix("\u00c2").startswith(("•", "·")):
                captured.append(line)
                continue
            saw_known_heading = True
            in_experience = False
            continue
        if in_experience:
            captured.append(line)
    return "\n".join(captured) if saw_known_heading else text


def _section_text(text: str, target_headings: frozenset[str]) -> str:
    captured: list[str] = []
    active = False
    for line in _expand_inline_headings(text).splitlines():
        heading = _heading_key(line)
        if heading in target_headings:
            active = True
            continue
        if heading in _EXPERIENCE_SECTION_HEADINGS or heading in _NON_EXPERIENCE_SECTION_HEADINGS:
            active = False
            continue
        if active:
            captured.append(line)
    return "\n".join(captured)


def _section_source(text: str, target_headings: frozenset[str]) -> str | None:
    """Keep the original heading as an anchor when phrases repeat elsewhere."""
    start = None
    offset = 0
    known_headings = _EXPERIENCE_SECTION_HEADINGS | _NON_EXPERIENCE_SECTION_HEADINGS
    for line in text.splitlines(keepends=True):
        content = line.rstrip("\r\n")
        prefix, separator, _ = content.partition(":")
        heading = _heading_key(prefix if separator else content)
        if heading in known_headings:
            if start is not None:
                return text[start:offset]
            if heading in target_headings:
                start = offset
        offset += len(line)
    return text[start:] if start is not None else None


def _expand_inline_headings(text: str) -> str:
    lines: list[str] = []
    headings = _EXPERIENCE_SECTION_HEADINGS | _NON_EXPERIENCE_SECTION_HEADINGS
    for line in text.splitlines():
        prefix, separator, remainder = line.partition(":")
        if separator and _heading_key(prefix) in headings:
            lines.extend((prefix, remainder))
        else:
            lines.append(line)
    return "\n".join(lines)


_DEGREE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(?:ph\.?d|doctorate|doctoral|tiến\s+sĩ|tien\s+si)\b", re.I), "DOCTORATE"),
    (re.compile(r"\b(?:master(?:'s)?|m\.?sc|thạc\s+sĩ|thac\s+si)\b", re.I), "MASTER"),
    (re.compile(r"\b(?:bachelor(?:'s)?|b\.?sc|cử\s+nhân|cu\s+nhan|đại\s+học|dai\s+hoc)\b", re.I), "BACHELOR"),
    (re.compile(r"\b(?:associate|cao\s+đẳng|cao\s+dang)\b", re.I), "ASSOCIATE"),
    (re.compile(r"\b(?:vocational|trung\s+cấp|trung\s+cap)\b", re.I), "VOCATIONAL"),
    (re.compile(r"\b(?:high\s+school|trung\s+học\s+phổ\s+thông|thpt)\b", re.I), "HIGH_SCHOOL"),
)
_FIELD_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(?:computer\s+science|khoa\s+học\s+máy\s+tính)\b", re.I), "Computer Science"),
    (re.compile(r"\b(?:information\s+technology|công\s+nghệ\s+thông\s+tin|cntt)\b", re.I), "Information Technology"),
    (re.compile(r"\b(?:software\s+engineering|kỹ\s+thuật\s+phần\s+mềm|công\s+nghệ\s+phần\s+mềm)\b", re.I), "Software Engineering"),
    (re.compile(r"\b(?:information\s+systems?|hệ\s+thống\s+thông\s+tin)\b", re.I), "Information Systems"),
    (re.compile(r"\b(?:cyber\s*security|an\s+toàn\s+thông\s+tin)\b", re.I), "Cybersecurity"),
    (re.compile(r"\b(?:data\s+science|khoa\s+học\s+dữ\s+liệu)\b", re.I), "Data Science"),
)
_LANGUAGE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(?:english|tiếng\s+anh|tieng\s+anh)\b", re.I), "en"),
    (re.compile(r"\b(?:vietnamese|tiếng\s+việt|tieng\s+viet)\b", re.I), "vi"),
    (re.compile(r"\b(?:japanese|tiếng\s+nhật|tieng\s+nhat)\b", re.I), "ja"),
    (re.compile(r"\b(?:korean|tiếng\s+hàn|tieng\s+han)\b", re.I), "ko"),
    (re.compile(r"\b(?:chinese|tiếng\s+trung|tieng\s+trung)\b", re.I), "zh"),
    (re.compile(r"\b(?:french|tiếng\s+pháp|tieng\s+phap)\b", re.I), "fr"),
    (re.compile(r"\b(?:german|tiếng\s+đức|tieng\s+duc)\b", re.I), "de"),
)
_PROFICIENCY = re.compile(r"\b(?:A[1-2]|B[1-2]|C[1-2]|N[1-5]|IELTS\s*\d(?:\.\d)?|TOEIC\s*\d{2,3})\b", re.I)


def _education(cv_version_id: str, text: str, extraction_method: str, *,
               evidence: list | None = None, pages: list[str] | None = None) -> list[dict[str, object]]:
    section = _section_text(text, _EDUCATION_SECTION_HEADINGS)
    search_text = section or text
    degree = next((value for pattern, value in _DEGREE_PATTERNS if pattern.search(search_text)), None)
    field = next((value for pattern, value in _FIELD_PATTERNS if pattern.search(search_text)), None)
    if degree is None and field is None:
        return []
    start_month, end_month, _ = _first_date_range(section)
    match = next((pattern.search(search_text) for pattern, _ in _DEGREE_PATTERNS if pattern.search(search_text)), None)
    evidence_offset = match.start() if match else 0
    result: dict[str, Any] = {
        "institutionRedacted": None,
        "degreeLevel": degree,
        "fieldOfStudy": field,
        "startMonth": start_month,
        "endMonth": end_month,
        "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{cv_version_id}:education:{evidence_offset}"))],
        "confidence": 0.72 if extraction_method == "OCR" else 0.82,
    }
    if evidence is not None:
        # The full education section supports degree, field and dates together.
        # Outside a section, only the actual matched degree/field text is cited.
        matches = [match for pattern, _ in (*_DEGREE_PATTERNS, *_FIELD_PATTERNS)
                   if (match := pattern.search(text)) is not None]
        excerpt = section or text[min(match.start() for match in matches):max(match.end() for match in matches)]
        attach_source_evidence(result, text, excerpt, evidence, pages,
                               within=_section_source(text, _EDUCATION_SECTION_HEADINGS))
    return [result]


def _projects(cv_version_id: str, text: str, *, evidence: list | None = None,
              pages: list[str] | None = None) -> list[dict[str, object]]:
    section = _section_text(text, frozenset({"projects", "personal projects", "dự án", "du an"}))
    projects = []
    # PDF text often has no empty lines between projects. Dated title lines
    # give stronger boundaries than paragraph spacing inside descriptions.
    section = _DATE_RANGE.sub(lambda match: re.sub(r"[\r\n]", " ", match.group()), section)
    source_lines = section.splitlines()
    headings = {}
    for index, line in enumerate(source_lines):
        date = _DATE_RANGE.search(line)
        if date is None or line[date.end():].strip():
            continue
        name = line[:date.start()].strip(" -–—|\t")
        if (name and len(name) <= 160 and not re.search(r"[.:!?•�]", name)
                and not line.lstrip().startswith(("- ", "* ", "•", "�"))
                and (name.isupper() or all(word[:1].isupper() for word in name.split()))):
            headings[index] = (name, date.group())
    if headings:
        starts = sorted({0, *headings})
        blocks = []
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else len(source_lines)
            lines = source_lines[start:end]
            if start in headings:
                name, dates = headings[start]
                lines = [name, dates, *lines[1:]]
            blocks.append(("\n".join(lines), "\n".join(source_lines[start:end])))
    else:
        blocks = [(block, block) for block in re.split(r"\n\s*\n", section)]
    for index, (block, source_block) in enumerate(blocks):
        lines = [line.strip(" -•\t") for line in block.splitlines() if line.strip(" -•\t")]
        # Require both a heading and a description; single fragments need review.
        if len(lines) < 2 or len(lines[0]) > 240:
            continue
        projects.append({"name": lines[0], "description": "\n".join(lines[1:])[:2000],
                         "skillIds": [s.stable_id for s in extract_known_skills(block)],
                         "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{cv_version_id}:project:{index}"))],
                         "confidence": 0.6})
        if evidence is not None:
            attach_source_evidence(projects[-1], text, source_block, evidence, pages,
                                   within=_section_source(text, frozenset({"projects", "personal projects", "dự án", "du an"})))
    return projects


def _certificates(cv_version_id: str, text: str, *, evidence: list | None = None,
                  pages: list[str] | None = None) -> list[dict[str, object]]:
    section = _section_text(text, frozenset({"certificates", "certifications", "chứng chỉ", "chung chi"}))
    results: list[dict[str, object]] = []
    for index, line in enumerate(section.splitlines()):
        name = line.strip(" -•\t")
        if not name or len(name) > 240 or not re.search(
            r"certif|chứng chỉ|chung chi|\b(?:AWS|CCNA|CCNP|PMP|IELTS|TOEIC|JLPT)\b", name, re.I,
        ):
            continue
        results.append({"name": name, "issuer": None, "issuedMonth": None,
                        "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{cv_version_id}:certificate:{index}"))],
                        "confidence": 0.6})
        if evidence is not None:
            attach_source_evidence(results[-1], text, name, evidence, pages,
                                   within=_section_source(text, frozenset({"certificates", "certifications", "chứng chỉ", "chung chi"})))
    return results


def _languages(cv_version_id: str, text: str, extraction_method: str, *,
               evidence: list | None = None, pages: list[str] | None = None) -> list[dict[str, object]]:
    section = _section_text(text, _LANGUAGE_SECTION_HEADINGS)
    search_text = section or text
    results: list[dict[str, object]] = []
    for pattern, code in _LANGUAGE_PATTERNS:
        match = pattern.search(search_text)
        if match is None:
            continue
        line_end = search_text.find("\n", match.end())
        end = line_end if line_end >= 0 else len(search_text)
        for other_pattern, _ in _LANGUAGE_PATTERNS:
            following = other_pattern.search(search_text, match.end())
            if following:
                end = min(end, following.start())
        line = search_text[match.end():end]
        proficiency_match = _PROFICIENCY.search(line)
        # Outside an explicit language section, require a proficiency marker to
        # avoid treating ordinary English/Vietnamese prose as a claimed skill.
        if not section and proficiency_match is None:
            continue
        results.append({
            "languageCode": code,
            "proficiency": proficiency_match.group(0).upper().replace(" ", "") if proficiency_match else None,
            "evidenceIds": [str(uuid5(_EVIDENCE_NAMESPACE, f"{cv_version_id}:language:{code}:{match.start()}"))],
            "confidence": 0.72 if extraction_method == "OCR" else 0.84,
        })
        if evidence is not None:
            excerpt_end = match.end() + proficiency_match.end() if proficiency_match else match.end()
            attach_source_evidence(results[-1], text, search_text[match.start():excerpt_end],
                                   evidence, pages, within=_section_source(text, _LANGUAGE_SECTION_HEADINGS))
    return results


def _experience_blocks(text: str) -> list[tuple[str, int]]:
    """Split common title-before-date CV layouts into independently parsed jobs."""
    # PDF extraction can put the month, separator, and end date on separate
    # lines. Flatten only matched ranges; preserve length for evidence offsets.
    text = _DATE_RANGE.sub(lambda match: re.sub(r"[\r\n]", " ", match.group()), text)
    lines: list[tuple[str, int, int]] = []
    offset = 0
    for raw_line in text.splitlines(keepends=True):
        value = raw_line.rstrip("\r\n")
        lines.append((value, offset, offset + len(value)))
        offset += len(raw_line)
    if text and (not lines or offset < len(text)):
        lines.append((text[offset:], offset, len(text)))

    date_lines = [index for index, (line, _, _) in enumerate(lines) if _DATE_RANGE.search(line)]
    if len(date_lines) < 2:
        stripped = text.strip()
        return [(stripped, text.find(stripped))] if stripped else []

    starts: list[int] = []
    previous_date_line = -1
    for date_line in date_lines:
        start_line = date_line
        nonempty_lines = 0
        for candidate in range(date_line, previous_date_line, -1):
            if not lines[candidate][0].strip():
                continue
            nonempty_lines += 1
            if nonempty_lines > 4:
                break
            if _title(lines[candidate][0])[0] is not None:
                start_line = candidate
                break
        starts.append(start_line)
        previous_date_line = date_line

    blocks: list[tuple[str, int]] = []
    for index, start_line in enumerate(starts):
        end_line = starts[index + 1] if index + 1 < len(starts) else len(lines)
        start_offset = lines[start_line][1]
        end_offset = lines[end_line][1] if end_line < len(lines) else len(text)
        block = text[start_offset:end_offset].strip()
        if block:
            blocks.append((block, start_offset))
    return blocks


def _experiences(cv_version_id: str, text: str, extraction_method: str, *,
                 evidence: list | None = None, source_text: str | None = None,
                 pages: list[str] | None = None) -> list[dict[str, object]]:
    experiences: list[dict[str, object]] = []
    for block, start_offset in _experience_blocks(text):
        title_raw, title_canonical = _title(block)
        if title_raw is None:
            continue
        block_skills = extract_known_skills(block)
        start_month, end_month, is_current = _first_date_range(block)
        responsibilities = [
            value for value in _responsibilities(block, block_skills)
            if value != title_raw
        ]
        experiences.append({
            "titleRaw": title_raw,
            "titleCanonical": title_canonical,
            "companyRedacted": None,
            "startMonth": start_month,
            "endMonth": end_month,
            "isCurrent": is_current,
            "responsibilities": responsibilities,
            "skillIds": [skill.stable_id for skill in block_skills],
            "evidenceIds": [str(uuid5(
                _EVIDENCE_NAMESPACE,
                f"{cv_version_id}:experience:{start_offset}:{start_offset + len(block)}",
            ))],
            "confidence": (0.62 if start_month else 0.48) if extraction_method == "OCR"
            else (0.72 if start_month else 0.58),
        })
        if evidence is not None:
            source = source_text or text
            attach_source_evidence(experiences[-1], source, block, evidence, pages,
                                   within=_section_source(source, _EXPERIENCE_SECTION_HEADINGS))
    return experiences


def _total_experience_months(text: str) -> int:
    experience_text = _experience_text(text)
    intervals: list[tuple[int, int]] = []
    for match in _DATE_RANGE.finditer(experience_text):
        start = _month(match.group("start"))
        end = _month(match.group("end"), end=True)
        if start is None or end is None:
            continue
        start_value = start[0] * 12 + start[1] - 1
        end_value = end[0] * 12 + end[1] - 1
        now = datetime.now(UTC)
        current_month = now.year * 12 + now.month - 1
        if start_value > current_month:
            continue
        end_value = min(end_value, current_month)
        if end_value < start_value or end_value - start_value > 600:
            continue
        intervals.append((start_value, end_value))
    if not intervals:
        explicit = re.search(
            r"(\d{1,2})\s*\+?\s*(?:(?:years?)(?:\s+of)?\s+experience|năm\s+kinh\s+nghiệm)",
            experience_text,
            re.IGNORECASE,
        )
        return int(explicit.group(1)) * 12 if explicit else 0
    months: set[int] = set()
    for interval_start, interval_end in intervals:
        months.update(range(interval_start, interval_end + 1))
    return len(months)
