"""Test the configured extractor using one synthetic JD, without DB/Kafka."""
import json

from pydantic import BaseModel

from app.jd.parser import parse_jd
from app.shared.config import Settings
from app.shared.extraction import get_provider


class _SkillDiagnostic(BaseModel):
    raw: str


class _DocumentDiagnostic(BaseModel):
    parserVersion: str


class _RequirementsDiagnostic(BaseModel):
    requiredSkills: list[_SkillDiagnostic]
    preferredSkills: list[_SkillDiagnostic]


class JdSmokePayload(BaseModel):
    """Validate only the parser fields used by the synthetic JD diagnostics."""

    document: _DocumentDiagnostic
    requirements: _RequirementsDiagnostic
    qualityFlags: list[str]


def main() -> int:
    settings = Settings(db_url="unused", auth_jwks_uri="unused", auth_jwt_issuer="unused",
                        auth_jwt_audience="unused")
    # Explicit synthetic diagnostic, not a user document or worker admission.
    extractor = get_provider(settings, kind="jd")
    if extractor is None:
        print("No external extraction provider enabled.")
        return 2
    result = JdSmokePayload.model_validate(parse_jd(
        "779494ac-c858-4570-a884-6e88423b8e2b", "a" * 64, "Software position",
        "Build services with the team.",
        "Java is essential. Kafka is a bonus. AWS is not required and is not assessed.",
        enricher=extractor,
    ), strict=True)
    required = [item.raw for item in result.requirements.requiredSkills]
    preferred = [item.raw for item in result.requirements.preferredSkills]
    success = (f"{extractor.provider.upper()}_ASSISTED_EXTRACTION" in result.qualityFlags
               and required == ["Java"] and preferred == ["Kafka"])
    print(json.dumps({"provider": extractor.provider, "parserVersion": result.document.parserVersion,
                      "requiredSkills": required, "preferredSkills": preferred,
                      "qualityFlags": result.qualityFlags, "passed": success}, ensure_ascii=False))
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
