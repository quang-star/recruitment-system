"""Source locations only; original document text remains in private storage."""
import re


def attach_source_evidence(item: dict, source: str, excerpt: str, locations: list,
                           pages: list[str] | None = None, *, within: str | None = None) -> None:
    """Attach only source-backed spans; whitespace layout may differ after parsing.

    A section limits the search so a repeated phrase in another section cannot
    become the evidence. If a quote cannot be located, keep the fact reviewable
    with no evidence IDs rather than inventing coordinates.
    """
    def find(value: str, start: int = 0, end: int | None = None):
        if not value.strip():
            return None
        pattern = "".join(r"\s+" if part.isspace() else re.escape(part)
                          for part in re.split(r"(\s+)", value.strip()))
        return re.compile(pattern).search(source, start, len(source) if end is None else end)

    section = find(within) if within is not None else None
    match = None if within is not None and section is None else find(
        excerpt, section.start() if section else 0, section.end() if section else None,
    )
    if match is None:
        item["evidenceIds"] = []
        return
    for evidence_id in item.get("evidenceIds", []):
        locations.append({"id": evidence_id, "page": _page_at(match.start(), pages),
                          "start": match.start(), "end": match.end()})


def inherit_review_evidence(items: list[dict], prior_items: list[dict]) -> None:
    """Only unchanged facts inherit parser-owned IDs; edits remain user claims."""
    ignored = {"evidenceIds", "confidence", "confirmedByRecruiter"}

    def facts(item):
        return {key: value for key, value in item.items() if key not in ignored}

    for item in items:
        prior = next((candidate for candidate in prior_items if facts(candidate) == facts(item)), None)
        item["evidenceIds"] = list(prior.get("evidenceIds", [])) if prior is not None else []


def _page_at(start: int, pages: list[str] | None) -> int | None:
    if pages is None:
        return None
    offset = 0
    for index, page in enumerate(pages, 1):
        if offset <= start < offset + len(page):
            return index
        offset += len(page) + (1 if page else 0)
    return None


def skill_locations(text: str, skills: list, pages: list[str] | None = None) -> list[dict]:
    locations = []
    for skill in skills:
        match = re.search(r"(?<!\w)" + re.escape(skill["raw"]) + r"(?!\w)", text, re.I)
        if match is None:
            continue
        for evidence_id in skill.get("evidenceIds", []):
            locations.append({"id": evidence_id, "page": _page_at(match.start(), pages),
                              "start": match.start(), "end": match.end()})
    return locations
