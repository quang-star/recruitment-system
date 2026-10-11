"""Provider registry and fail-closed consent/budget policy for worker extraction."""
from copy import deepcopy
import logging
import re
from typing import Callable

from app.shared.extraction_privacy import professional_source
from app.shared.extraction_types import DocumentKind, ExtractionContext, ExtractionProvider
from app.shared.extraction_usage import ExtractionUsageRepository
from app.shared.gemini import GeminiExtractor
from app.shared.groq import GroqExtractor
from app.shared.source_extraction import SourceExtractor

LOGGER = logging.getLogger(__name__)
_PROVIDERS: dict[str, Callable[..., SourceExtractor]] = {
    "groq": GroqExtractor,
    "gemini": lambda settings: GeminiExtractor(settings, allow_backup=False),
}


def get_provider(settings, *, kind: DocumentKind | None = None) -> SourceExtractor | None:
    """Transport construction only; production callers use get_extractor."""
    name = (getattr(settings, f"{kind}_extraction_provider", None) if kind else None) \
        or getattr(settings, "extraction_provider", "gemini")
    if not isinstance(name, str):
        return None
    builder = _PROVIDERS.get(name)
    if builder is None or not getattr(settings, f"{name}_enabled", False):
        return None
    return builder(settings)


def _with_flag(baseline: dict, kind: str, flag: str) -> dict:
    result = deepcopy(baseline)
    flags = result["summary"]["qualityFlags"] if kind == "cv" else result["qualityFlags"]
    if flag not in flags:
        flags.append(flag)
    return result


class ManagedExtractor:
    def __init__(self, provider: SourceExtractor, context: ExtractionContext | None, budget):
        self.client = provider
        self.context = context
        self.budget = budget
        self.provider = provider.provider

    @property
    def model(self) -> str:
        return self.client.model

    def __call__(self, kind: DocumentKind, text: str, baseline: dict) -> dict:
        if self.context is None or not self.context.permits_external_ai:
            return _with_flag(baseline, kind, "EXTERNAL_AI_NOT_CONSENTED")
        if self.budget is None:
            return _with_flag(baseline, kind, "EXTERNAL_AI_BUDGET_UNAVAILABLE")
        if not self.client._keys() or not text.strip() or len(text) > self.client._option("max_input_chars"):
            return self.client(kind, text, baseline)
        if not re.sub(r"[█\s]", "", professional_source(kind, text)):
            return _with_flag(baseline, kind, "EXTERNAL_AI_NO_PROFESSIONAL_CONTENT")
        try:
            key, reason = self.budget.reserve(self.context, kind, self.provider, self.model)
        except Exception:
            LOGGER.warning("External extraction admission unavailable")
            return _with_flag(baseline, kind, "EXTERNAL_AI_BUDGET_UNAVAILABLE")
        if key is None:
            return _with_flag(baseline, kind, reason or "EXTERNAL_AI_BUDGET_UNAVAILABLE")
        result = self.client(kind, text, baseline)
        flags = result["summary"]["qualityFlags"] if kind == "cv" else result["qualityFlags"]
        outcome = "SUCCEEDED" if f"{self.provider.upper()}_ASSISTED_EXTRACTION" in flags else "FALLBACK"
        try:
            self.budget.finish(key, outcome, self.client.usage)
        except Exception:
            # Admission remains spent; audit failure must not trigger another call.
            LOGGER.warning("External extraction outcome persistence unavailable")
        return result


class LocalExtractor:
    provider = "rules"
    model = "local"

    def __call__(self, kind: DocumentKind, text: str, baseline: dict) -> dict:
        return _with_flag(baseline, kind, "EXTERNAL_AI_NOT_CONFIGURED")


def get_extractor(settings, *, context: ExtractionContext | None = None,
                  session_factory=None, kind: DocumentKind | None = None) -> ExtractionProvider | None:
    provider = get_provider(settings, kind=kind)
    if provider is None:
        return LocalExtractor() if context is not None and context.permits_external_ai else None
    budget = ExtractionUsageRepository(
        session_factory, daily_limit=settings.extraction_daily_call_limit,
        user_daily_limit=settings.extraction_user_daily_call_limit,
    ) if session_factory is not None else None
    return ManagedExtractor(provider, context, budget)
