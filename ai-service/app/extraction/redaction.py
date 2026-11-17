"""Conservative outbound section filtering; preserve original evidence offsets."""
import re

_CV_SECTIONS = frozenset({
    "skills", "technical skills", "kỹ năng", "ky nang", "kỹ năng chuyên môn",
    "experience", "work experience", "professional experience", "career",
    "employment history", "work history", "kinh nghiệm", "kinh nghiệm làm việc",
    "quá trình công tác", "education", "academic background", "academic journey",
    "qualifications", "học vấn", "hoc van", "projects", "personal projects",
    "dự án", "du an", "certificates", "certifications", "chứng chỉ", "chung chi",
    "languages", "language", "ngôn ngữ", "ngoại ngữ", "ngon ngu", "ngoai ngu",
})
_PRIVATE_SECTIONS = frozenset({
    "contact", "contact information", "personal information", "personal details",
    "references", "reference", "thông tin cá nhân", "thông tin liên hệ",
    "liên hệ", "người tham chiếu", "sở thích", "interests", "hobbies",
    "summary", "profile", "objective", "mục tiêu", "activities", "hoạt động",
})
_CONTACT_PATTERNS = (
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}",
    r"https?://[^\s]+|www\.[^\s]+",
    r"(?<!\w)(?:\+?\d{9,15}|(?:\+\d{1,3}[ .-]?)?\(?\d{3,4}\)?[ .-]\d{3}[ .-]\d{3,4})(?!\w)",
    r"(?im)^\s*(?:name|full name|họ tên|họ và tên|address|địa chỉ|date of birth|ngày sinh|"
    r"gender|giới tính|nationality|quốc tịch|marital status|tình trạng hôn nhân|"
    r"citizen id|passport|cccd|cmnd|email|e-mail|phone|điện thoại|số điện thoại)\s*[:：].*$",
)


def _mask(value: str) -> str:
    return re.sub(r"[^\r\n]", "█", value)


def redact_contacts(text: str) -> str:
    """Best effort, not a claim of complete anonymization."""
    for pattern in _CONTACT_PATTERNS:
        text = re.sub(pattern, lambda match: _mask(match.group()), text)
    return text


def professional_source(kind: str, text: str) -> str:
    if kind not in {"cv", "jd"}:
        raise ValueError("Unsupported document kind")
    active = kind == "jd"
    lines = []
    for line in text.splitlines(keepends=True):
        heading = line.strip().strip(" :：-•").casefold()
        if heading in _PRIVATE_SECTIONS:
            active = False
        elif heading in _CV_SECTIONS or (kind == "jd" and heading in {
            "requirements", "responsibilities", "yêu cầu", "mô tả công việc",
        }):
            active = True
        lines.append(line if active else _mask(line))
    return redact_contacts("".join(lines))
