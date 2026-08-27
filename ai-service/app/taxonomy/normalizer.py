from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path
import re
import unicodedata


@dataclass(frozen=True, slots=True)
class TaxonomySkill:
    stable_id: str
    canonical_name: str
    raw: str
    start: int = -1
    end: int = -1


@dataclass(frozen=True, slots=True)
class Taxonomy:
    version: str
    by_alias: dict[str, tuple[str, str]]
    search_aliases: tuple[tuple[str, str, str], ...]


def normalize_skill(raw: str) -> TaxonomySkill | None:
    entry = taxonomy().by_alias.get(_key(raw))
    if entry is None:
        return None
    stable_id, canonical_name = entry
    return TaxonomySkill(stable_id=stable_id, canonical_name=canonical_name, raw=raw.strip())


def extract_known_skills(text: str) -> list[TaxonomySkill]:
    """Return non-overlapping exact/alias matches, longest aliases first.

    Matching is deliberately conservative: a canonical ID is emitted only for a
    term present in the checked-in taxonomy. This avoids silently turning an
    unknown product or acronym into a different skill.
    """
    matches: list[TaxonomySkill] = []
    occupied: list[tuple[int, int]] = []
    seen_ids: set[str] = set()
    for alias, stable_id, canonical_name in taxonomy().search_aliases:
        pattern = re.compile(rf"(?<![\w]){re.escape(alias)}(?![\w])", re.IGNORECASE)
        for match in pattern.finditer(text):
            if stable_id in seen_ids:
                break
            if any(match.start() < end and match.end() > start for start, end in occupied):
                continue
            matches.append(TaxonomySkill(
                stable_id=stable_id,
                canonical_name=canonical_name,
                raw=match.group(0),
                start=match.start(),
                end=match.end(),
            ))
            occupied.append((match.start(), match.end()))
            seen_ids.add(stable_id)
            break
    return sorted(matches, key=lambda skill: skill.start)


def taxonomy_version() -> str:
    return taxonomy().version


@lru_cache(maxsize=1)
def taxonomy() -> Taxonomy:
    source = _taxonomy_path()
    payload = json.loads(source.read_text(encoding="utf-8"))
    by_alias: dict[str, tuple[str, str]] = {}
    searchable: dict[str, tuple[str, str]] = {}
    for skill in payload["skills"]:
        stable_id = str(skill["stableId"])
        canonical_name = str(skill["canonicalName"])
        terms = [canonical_name, str(skill["normalizedName"])]
        for alias in skill.get("aliases", []):
            terms.extend((str(alias["value"]), str(alias["normalized"])))
        for term in terms:
            key = _key(term)
            if not key:
                continue
            by_alias[key] = (stable_id, canonical_name)
            # Prefer a human-readable spelling in extracted payloads, while all
            # spellings still resolve through by_alias during user review.
            searchable.setdefault(term.casefold(), (stable_id, canonical_name))
    search_aliases = tuple(
        (alias, value[0], value[1])
        for alias, value in sorted(searchable.items(), key=lambda item: len(item[0]), reverse=True)
    )
    return Taxonomy(
        version=str(payload["semanticVersion"]),
        by_alias=by_alias,
        search_aliases=search_aliases,
    )


def _key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    normalized = normalized.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", normalized)


def _taxonomy_path() -> Path:
    repository_path = (
        Path(__file__).resolve().parents[3]
        / "contracts"
        / "taxonomy"
        / "it-skills-v1.seed.json"
    )
    if repository_path.exists():
        return repository_path
    container_path = Path("/app/contracts/taxonomy/it-skills-v1.seed.json")
    if container_path.exists():
        return container_path
    raise RuntimeError("The versioned IT skill taxonomy seed is unavailable")
