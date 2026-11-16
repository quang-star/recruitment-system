"""Shared IT role-family classification for CV experience titles and JD titles.

CV and JD must use the same rules, otherwise the title/experience components of
matching silently disable themselves when one side spells a title differently.
"""
from __future__ import annotations

import re

_SEP = r"[\s_-]*"
# Order matters: the first family whose marker appears in the title wins.
_ROLE_FAMILIES: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (family, re.compile(rf"(?<![a-z0-9])(?:{markers})(?![a-z0-9])", re.I))
    for family, markers in (
        ("FULLSTACK", rf"full{_SEP}stack"),
        ("BACKEND", rf"back{_SEP}end"),
        ("FRONTEND", rf"front{_SEP}end"),
        ("MOBILE", rf"mobile|ios|android|flutter|react{_SEP}native"),
        ("DEVOPS", rf"dev{_SEP}ops|sre|site{_SEP}reliability"),
        ("DATA_AI", rf"data(?!{_SEP}base)|big{_SEP}data|machine{_SEP}learning|deep{_SEP}learning|ml|ai"),
        ("SECURITY", r"security|cyber\s*security|pentest(?:er)?|bảo\s+mật|an\s+toàn\s+thông\s+tin"),
        ("QA", rf"qa|qc|tester|testing|quality{_SEP}assurance|kiểm\s+thử"),
    )
)


def role_family(title: str | None) -> str:
    """Return the canonical IT role family for a free-text title, or ``OTHER``."""
    text = str(title or "").casefold()
    for family, pattern in _ROLE_FAMILIES:
        if pattern.search(text):
            return family
    return "OTHER"


SENIORITY_ORDER: dict[str, int] = {
    "INTERN": 1,
    "FRESHER": 2,
    "JUNIOR": 3,
    "MIDDLE": 4,
    "SENIOR": 5,
    "LEAD": 6,
    "MANAGER": 7,
}

_LEVEL_MARKERS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (level, re.compile(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", re.I))
    for pattern, level in (
        ("intern", "INTERN"),
        ("fresher", "FRESHER"),
        ("junior", "JUNIOR"),
        (r"mid(?:dle|[-\s]+level)", "MIDDLE"),
        (r"senior|sr\.?", "SENIOR"),
        (r"lead|principal|staff", "LEAD"),
        ("manager", "MANAGER"),
    )
)


def role_level(title: str | None) -> str | None:
    """Return the canonical IT seniority level for a title, or ``None``."""
    text = str(title or "").casefold()
    for level, pattern in _LEVEL_MARKERS:
        if pattern.search(text):
            return level
    return None
