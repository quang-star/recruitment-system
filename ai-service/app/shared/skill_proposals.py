"""Source-backed skill names that do not change the shared taxonomy."""
import re
import unicodedata
from uuid import NAMESPACE_URL, uuid5

from app.shared.evidence import _page_at
from app.taxonomy.normalizer import normalize_skill


def skill_name_key(raw: str) -> str:
    # Preserve meaningful punctuation: C++, C# and C are different names.
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", raw).casefold()).strip()


def propose_skill(raw: str, version: str, source: str, *, kind: str,
                  clauses: list[str] | None = None,
                  pages: list[str] | None = None) -> tuple[dict, dict] | None:
    name = raw.strip()
    if not name or len(name) > 240 or any(character in name for character in "\r\n█"):
        raise ValueError("Invalid skill proposal")
    pattern = re.compile(r"(?<![\w.+#-])" + re.escape(name) + r"(?![\w+#-]|\.\w)")
    match = pattern.search(source)
    if match is None or (clauses is not None and not any(pattern.search(clause) for clause in clauses)):
        raise ValueError("Skill proposal has no supporting source clause")
    if normalize_skill(name) is not None:
        return None
    # Locate inside the classified clause, rather than a repeated background mention.
    if clauses is not None:
        clause = next(clause for clause in clauses if pattern.search(clause))
        start = source.index(clause)
        match = pattern.search(source, start, start + len(clause))
        assert match is not None
    evidence_id = str(uuid5(NAMESPACE_URL, f"{version}:{kind}:skill-proposal:{skill_name_key(name)}:{match.start()}"))
    item = {"raw": name, "canonicalSkillId": None, "normalizationStatus": "PENDING",
            "evidenceIds": [evidence_id], "confidence": 0.7}
    location = {"id": evidence_id, "page": _page_at(match.start(), pages),
                "start": match.start(), "end": match.end()}
    return item, location
