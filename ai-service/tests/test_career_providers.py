from io import BytesIO
import json
from types import SimpleNamespace

import pytest

from app.career.models import ProviderSuggestions
from app.career.providers import PROMPT, career_provider
from app.shared.config import Settings


def settings(provider="groq", **overrides):
    return Settings(
        _env_file=None,
        **(
            {
                "db_url": "unused",
                "auth_jwks_uri": "unused",
                "auth_jwt_issuer": "unused",
                "auth_jwt_audience": "unused",
                "jd_extraction_provider": provider,
                "groq_enabled": True,
                "groq_api_key": "synthetic-key",
                "gemini_enabled": True,
                "gemini_api_key": "synthetic-key",
                "gemini_backup_api_key": "synthetic-backup",
            }
            | overrides
        ),
    )


@pytest.mark.parametrize("name", ["groq", "gemini"])
def test_career_transport_reuses_timeout_usage_and_schema_with_its_own_prompt(
    monkeypatch, name
):
    calls = []
    if name == "groq":
        raw = {
            "choices": [
                {"finish_reason": "stop", "message": {"content": '{"suggestions":[]}'}}
            ],
            "usage": {"prompt_tokens": 13, "completion_tokens": 3},
        }
    else:
        raw = {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": '{"suggestions":[]}'}]},
                }
            ],
            "usageMetadata": {"promptTokenCount": 13, "candidatesTokenCount": 3},
        }

    def open_request(request, timeout):
        calls.append((request, timeout))
        return BytesIO(json.dumps(raw).encode())

    monkeypatch.setattr(
        f"app.shared.{name}.build_opener",
        lambda *args: SimpleNamespace(open=open_request),
    )
    provider = career_provider(settings(name))
    assert provider.available() and provider.generate("Build Java services.", []) == {
        "suggestions": []
    }
    assert provider.usage == {"input_tokens": 13, "output_tokens": 3}
    assert len(calls) == 1 and calls[0][1] == 25
    body = json.loads(calls[0][0].data)
    if name == "groq":
        assert body["messages"][0]["content"] == PROMPT
        schema = body["response_format"]["json_schema"]["schema"]
    else:
        assert body["systemInstruction"]["parts"][0]["text"] == PROMPT
        schema = body["generationConfig"]["responseJsonSchema"]
    assert (
        schema == ProviderSuggestions.model_json_schema()
        and schema["additionalProperties"] is False
    )
    assert "classification" in PROMPT and "EXACT, contiguous quote" not in PROMPT


def test_career_uses_requested_provider_without_automatic_failover():
    assert career_provider(settings("rules")) is None
    assert career_provider(settings(groq_enabled=False)) is None
    assert career_provider(settings("gemini")).client.allow_backup is False
