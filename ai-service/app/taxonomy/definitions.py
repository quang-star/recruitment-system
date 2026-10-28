"""Skill definition fields shared by catalog validation and its HTTP boundary."""
from app.shared.api_ids import BusinessId
import hashlib
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.taxonomy.normalizer import _key

SkillType = Literal["language", "framework", "library", "database", "cloud", "devops", "testing",
                    "data_ai", "security", "methodology", "soft_skill", "other"]
SkillCategory = Literal["backend", "frontend", "fullstack", "mobile", "devops", "data_ai", "qa",
                        "security", "cross_functional"]
RelationType = Literal["BROADER", "NARROWER", "RELATED", "SUPERSEDES"]


class SkillRelation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: RelationType
    targetSkillId: BusinessId


def normalized_name(value: str) -> str:
    """Keep the human spelling for lookup and use an ASCII slug in the contract."""
    folded = unicodedata.normalize("NFKD", _key(value).replace("đ", "d"))
    ascii_name = "".join(char for char in folded if not unicodedata.combining(char))
    slug = re.sub(r"[^a-z0-9.+#/-]+", "-", ascii_name).lstrip(".+#/-").rstrip("/-")
    if not re.fullmatch(r"[a-z0-9]+(?:[.+#/-][a-z0-9]+|[.+#])*", slug):
        slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return slug or "skill-" + hashlib.sha256(_key(value).encode()).hexdigest()[:16]


def compatible_skill(skill: dict) -> dict:
    """Align the legacy live projection without rewriting published snapshots."""
    result = dict(skill)
    if result["type"] == "tool":
        result["type"] = "other"
    if result["category"] == "other":
        result["category"] = "cross_functional"
    if not re.fullmatch(r"[a-z0-9]+(?:[.+#/-][a-z0-9]+|[.+#])*", result["normalizedName"]):
        result["normalizedName"] = normalized_name(result["canonicalName"])
    return result
