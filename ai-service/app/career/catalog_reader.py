from app.shared.api_ids import BusinessId
from hashlib import sha256
import json
from typing import Literal, Protocol
import unicodedata
from urllib.parse import urlsplit
from urllib.error import HTTPError
from urllib.request import Request, build_opener

from pydantic import BaseModel, Field, TypeAdapter

from app.shared.source_extraction import _NoRedirect
from app.shared.extraction_privacy import redact_contacts


class CategoryEntry(BaseModel):
    id: BusinessId
    kind: Literal["INDUSTRY", "SPECIALIZATION", "POSITION"]
    parentId: BusinessId | None
    name: str = Field(min_length=1, max_length=160)
    status: Literal["ACTIVE"]
    version: int = Field(ge=0)


class CoreCatalogReader(Protocol):
    def read(self) -> list[CategoryEntry]: ...


class HttpCoreCatalogReader:
    def __init__(self, url: str, timeout: float):
        self.url, self.timeout = url, timeout

    def read(self) -> list[CategoryEntry]:
        url = urlsplit(self.url)
        if (url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password
                or url.query or url.fragment or url.path != "/api/v2/public/job-categories"):
            raise ValueError("Invalid Core catalog endpoint")
        request = Request(self.url, headers={"Accept": "application/json"})
        try:
            with build_opener(_NoRedirect()).open(request, timeout=self.timeout) as response:
                raw = response.read(262145)
        except HTTPError as error:
            error.close()
            raise ValueError("Core catalog unavailable") from None
        if len(raw) > 262144:
            raise ValueError("Catalog response too large")
        entries = TypeAdapter(list[CategoryEntry]).validate_python(json.loads(raw))
        if len(entries) > 1000 or len({entry.id for entry in entries}) != len(entries):
            raise ValueError("Invalid Core catalog size or identity")
        return entries


def usable_catalog(entries: list[CategoryEntry]) -> list[CategoryEntry]:
    """Exclude private labels and orphaned children without changing Core rows."""
    entries = [entry for entry in entries if safe_label(entry.name)]
    roots = {entry.id for entry in entries if entry.kind == "INDUSTRY" and entry.parentId is None}
    groups = {entry.id for entry in entries if entry.kind == "SPECIALIZATION" and entry.parentId in roots}
    return sorted((entry for entry in entries if entry.id in roots or entry.id in groups
                   or (entry.kind == "POSITION" and entry.parentId in groups)), key=lambda entry: str(entry.id))


def safe_label(value: str) -> bool:
    normalized = unicodedata.normalize("NFKC", value)
    return "█" not in value and redact_contacts(value) == value and redact_contacts(normalized) == normalized


def catalog_hash(entries: list[CategoryEntry]) -> str:
    payload = [entry.model_dump(mode="json") for entry in entries]
    return sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
