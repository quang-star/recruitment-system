from app.shared.api_ids import BusinessId
from hashlib import sha256
import json
import re
from typing import Literal
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator


class CareerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=30000)
    requirementsText: str = Field(default="", max_length=30000)
    externalAiConsent: StrictBool = False
    externalAiPolicyVersion: str | None = Field(default=None, max_length=40)

    @field_validator("title")
    @classmethod
    def nonblank_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Title must not be blank")
        return value

    def input_hash(self) -> str:
        content = {key: getattr(self, key) for key in ("title", "description", "requirementsText")}
        return sha256(json.dumps(content, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    def source(self) -> str:
        return f"{self.title}\nResponsibilities\n{self.description}\nRequirements\n{self.requirementsText}"


class CategoryChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    industryId: BusinessId | None
    industryName: str = Field(min_length=1, max_length=160)
    specializationId: BusinessId | None
    specializationName: str = Field(min_length=1, max_length=160)
    positionId: BusinessId | None
    positionName: str = Field(min_length=1, max_length=160)

    @field_validator("industryName", "specializationName", "positionName")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if any(unicodedata.category(character).startswith("C") for character in value):
            raise ValueError("Category names must be on one line")
        value = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()
        if not 1 <= len(value) <= 160:
            raise ValueError("Category names require 1–160 characters")
        return value


class CareerSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: CategoryChoice
    evidenceQuotes: list[str] = Field(min_length=1, max_length=3)

    @field_validator("evidenceQuotes")
    @classmethod
    def bounded_quotes(cls, value: list[str]) -> list[str]:
        if any(not quote.strip() or len(quote) > 240 for quote in value) or len(set(value)) != len(value):
            raise ValueError("Evidence quotes must be distinct and contain 1–240 characters")
        return value


class ProviderSuggestions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    suggestions: list[CareerSuggestion] = Field(max_length=3)


class CareerResponse(BaseModel):
    status: Literal["SUGGESTED", "MANUAL"]
    reasonCode: str | None
    inputHash: str
    catalogHash: str | None
    suggestions: list[CareerSuggestion]
