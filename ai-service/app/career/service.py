import logging
import hashlib
import json
import re
from typing import Protocol
import unicodedata

from app.career.catalog_reader import CategoryEntry, CoreCatalogReader, catalog_hash, safe_label, usable_catalog
from app.career.models import CareerRequest, CareerResponse, CareerSuggestion, ProviderSuggestions
from app.career.providers import CareerProvider
from app.shared.extraction_privacy import professional_source
from app.shared.extraction_types import EXTERNAL_AI_POLICY_VERSION, ExtractionContext

LOGGER = logging.getLogger(__name__)


class CareerBudget(Protocol):
    def reserve(self, context: ExtractionContext, kind: str, provider: str, model: str) -> tuple[str | None, str | None]: ...
    def finish(self, key: str, outcome: str, usage: dict) -> None: ...


def draft_identity(actor: int, input_hash: str, catalog_digest: str) -> int:
    digest = hashlib.sha256(f"career-draft/v2:{actor}:{input_hash}:{catalog_digest}".encode()).digest()
    return (int.from_bytes(digest[:8], "big") & (2**63 - 1)) or 1


class CareerSuggestionService:
    def __init__(self, catalog: CoreCatalogReader, provider: CareerProvider | None, budget: CareerBudget | None):
        self.catalog, self.provider, self.budget = catalog, provider, budget

    def suggest(self, actor: int, request: CareerRequest) -> CareerResponse:
        input_hash = request.input_hash()
        digest: str | None = None

        def manual(reason: str) -> CareerResponse:
            return CareerResponse(status="MANUAL", reasonCode=reason, inputHash=input_hash, catalogHash=digest, suggestions=[])

        if not request.externalAiConsent or request.externalAiPolicyVersion != EXTERNAL_AI_POLICY_VERSION:
            return manual("EXTERNAL_AI_NOT_CONSENTED")
        provider = self.provider
        if provider is None or not provider.available():
            return manual("EXTERNAL_AI_NOT_CONFIGURED")
        # Normalize before redaction so compatibility characters cannot hide contacts.
        # The immutable draft hash still describes the original request fields.
        source = professional_source("jd", unicodedata.normalize("NFKC", request.source()))
        if len(request.source()) > provider.input_limit():
            return manual("EXTERNAL_AI_INPUT_SKIPPED")
        content = source.replace("\nResponsibilities\n", "\n").replace("\nRequirements\n", "\n")
        if not re.sub(r"[█\s]", "", content):
            return manual("EXTERNAL_AI_NO_PROFESSIONAL_CONTENT")
        if self.budget is None:
            return manual("EXTERNAL_AI_BUDGET_UNAVAILABLE")
        try:
            entries = usable_catalog(self.catalog.read())
            digest = catalog_hash(entries)
        except Exception:
            return manual("CATALOG_UNAVAILABLE")
        catalog_payload = [entry.model_dump(mode="json") for entry in entries]
        if len(json.dumps({"document": source, "catalog": catalog_payload}, ensure_ascii=False)) > provider.input_limit():
            return manual("EXTERNAL_AI_INPUT_SKIPPED")
        context = ExtractionContext(actor, draft_identity(actor, input_hash, digest), input_hash, True, EXTERNAL_AI_POLICY_VERSION)
        try:
            key, reason = self.budget.reserve(context, "jd", provider.provider, provider.model)
        except Exception:
            return manual("EXTERNAL_AI_BUDGET_UNAVAILABLE")
        if key is None:
            return manual(reason or "EXTERNAL_AI_BUDGET_UNAVAILABLE")
        outcome = "FALLBACK"
        try:
            raw = provider.generate(source, catalog_payload)
        except Exception:
            result = manual("PROVIDER_UNAVAILABLE")
        else:
            try:
                suggestions = ProviderSuggestions.model_validate(raw).suggestions
                for suggestion in suggestions:
                    validate_suggestion(suggestion, entries, source)
                if len({suggestion.category.model_dump_json() for suggestion in suggestions}) != len(suggestions):
                    raise ValueError("Duplicate classification")
                if suggestions:
                    outcome = "SUCCEEDED"
                    result = CareerResponse(status="SUGGESTED", reasonCode=None, inputHash=input_hash,
                                            catalogHash=digest, suggestions=suggestions)
                else:
                    result = manual("NO_SUGGESTION")
            except Exception:
                result = manual("INVALID_SUGGESTION")
        try:
            self.budget.finish(key, outcome, provider.usage)
        except Exception:
            LOGGER.warning("Career suggestion outcome persistence unavailable")
        return result


def validate_suggestion(suggestion: CareerSuggestion, entries: list[CategoryEntry], source: str) -> None:
    by_id = {entry.id: entry for entry in entries}
    parent: int | None = None
    for key, kind in (("industry", "INDUSTRY"), ("specialization", "SPECIALIZATION"), ("position", "POSITION")):
        identifier = getattr(suggestion.category, f"{key}Id")
        name = getattr(suggestion.category, f"{key}Name")
        if not safe_label(name):
            raise ValueError("Category name contains contact details")
        if identifier is not None:
            entry = by_id.get(identifier)
            if entry is None or entry.kind != kind or entry.parentId != parent or entry.name != name:
                raise ValueError("Category identity or hierarchy is invalid")
            if key != "industry" and parent is None:
                raise ValueError("Canonical category cannot descend from a new parent")
        parent = identifier
    if any(quote not in source or not safe_label(quote) for quote in suggestion.evidenceQuotes):
        raise ValueError("Classification evidence is ungrounded or private")
