from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader


def parse_pdf(cv_version_id: str, source_hash: str, content: bytes) -> dict[str, object]:
    reader = PdfReader(BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    quality_flags = ["LOW_TEXT_SIGNAL", "OCR_REQUIRED"] if len(text) < 100 else ["NO_STRUCTURED_DATA"]
    language = "vi" if any(character in text.lower() for character in "ăâđêôơư") else "unknown"
    return {
        "$schema": "https://smart-recruitment.local/contracts/schemas/parsed-cv-v1.schema.json",
        "schemaVersion": "parsed-cv/1.0",
        "document": {
            "cvVersionId": cv_version_id,
            "language": language,
            "sourceHash": source_hash,
            "parserVersion": "rules-v0.1.0",
        },
        "skills": [],
        "experiences": [],
        "projects": [],
        "education": [],
        "certificates": [],
        "languages": [],
        "summary": {
            "totalExperienceMonths": 0,
            "overallConfidence": 0.2 if not text else 0.35,
            "qualityFlags": quality_flags,
        },
    }
