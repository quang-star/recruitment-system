"""Provider-independent contracts for document extraction."""
from dataclasses import dataclass
from typing import Literal, Protocol

EXTERNAL_AI_POLICY_VERSION = "external-ai/1.0"
DocumentKind = Literal["cv", "jd"]


class ExtractionProvider(Protocol):
    provider: str

    @property
    def model(self) -> str: ...

    def __call__(self, kind: DocumentKind, text: str, baseline: dict) -> dict: ...


@dataclass(frozen=True)
class ExtractionContext:
    owner_user_id: int
    resource_id: int
    source_hash: str
    consented: bool = False
    policy_version: str | None = None

    @property
    def permits_external_ai(self) -> bool:
        return self.consented is True and self.policy_version == EXTERNAL_AI_POLICY_VERSION
