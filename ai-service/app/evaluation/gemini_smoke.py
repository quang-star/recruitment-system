"""One paid/free-tier API request with a synthetic JD; never sends real CV data."""
import json

from app.evaluation.extraction_smoke import JdSmokePayload
from app.jd.parser import parse_jd
from app.shared.config import Settings
from app.shared.gemini import GeminiExtractor


def main() -> int:
    # Only the dedicated local Gemini config is loaded; no DB/Kafka/storage access.
    settings = Settings(db_url="unused", auth_jwks_uri="unused", auth_jwt_issuer="unused",
                        auth_jwt_audience="unused", gemini_enabled=True)
    if not (settings.gemini_api_key.get_secret_value() or settings.gemini_backup_api_key.get_secret_value()):
        print("Set AI_GEMINI_API_KEY in the process environment before running this test.")
        return 2
    result = JdSmokePayload.model_validate(parse_jd(
        "779494ac-c858-4570-a884-6e88423b8e2b", "a" * 64, "Backend Developer",
        "Build Java services.", "Java is essential. Kafka would be a bonus.",
        enricher=GeminiExtractor(settings),
    ), strict=True)
    print(json.dumps({"parserVersion": result.document.parserVersion,
                      "qualityFlags": result.qualityFlags,
                      "requiredSkills": [item.raw for item in result.requirements.requiredSkills],
                      "preferredSkills": [item.raw for item in result.requirements.preferredSkills]},
                     ensure_ascii=False))
    return 0 if "GEMINI_ASSISTED_EXTRACTION" in result.qualityFlags else 1


if __name__ == "__main__":
    raise SystemExit(main())
