"""Gemini transport for the shared grounded extraction interface."""
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, build_opener

from app.shared.source_extraction import SourceExtractor, _NoRedirect, _PROMPT, _response_schema
from app.shared.source_extraction import _contract, _FIELDS  # noqa: F401 — compatibility for callers
from app.shared.extraction_privacy import redact_contacts  # noqa: F401 — compatibility for callers


class GeminiExtractor(SourceExtractor):
    def __init__(self, settings, *, allow_backup: bool = True):
        super().__init__(settings)
        self.allow_backup = allow_backup

    def _keys(self) -> list[str]:
        return list(dict.fromkeys(key.get_secret_value() for key in (
            self.settings.gemini_api_key, self.settings.gemini_backup_api_key,
        ) if key.get_secret_value()))

    def _generate(self, kind: str, source: str) -> dict:
        return self.generate_json(_PROMPT, {"documentType": kind, "document": source}, _response_schema(kind))

    def generate_json(self, prompt: str, document: dict, schema: dict) -> dict:
        model = self.settings.gemini_model
        if not re.fullmatch(r"gemini-[a-z0-9.-]+", model):
            raise ValueError("Invalid model")
        body = {
            "systemInstruction": {"parts": [{"text": prompt}]},
            "contents": [{"role": "user", "parts": [{
                "text": json.dumps(document, ensure_ascii=False),
            }]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 8192,
                                 "responseMimeType": "application/json",
                                 "responseJsonSchema": schema},
        }
        keys = self._keys()
        if not self.allow_backup:
            keys = keys[:1]
        if not keys:
            raise ValueError("Missing API key")
        for index, key in enumerate(keys):
            try:
                return self._request(model, body, key)
            except HTTPError as error:
                status = error.code
                error.close()
                # One backup attempt only after an explicit authorization rejection.
                # Quota, overload, timeout and invalid content use the local parser.
                if status not in (401, 403) or index == len(keys) - 1:
                    raise
        raise RuntimeError("No Gemini response")

    def _request(self, model: str, body: dict, key: str) -> dict:
        request = Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json",
                     "x-goog-api-key": key},
        )
        # No redirects carrying the key.
        with build_opener(_NoRedirect()).open(
            request, timeout=self.settings.gemini_timeout_seconds,
        ) as response:
            raw = response.read(262145)
        if len(raw) > 262144:
            raise ValueError("Response too large")
        payload = json.loads(raw)
        self.record_usage(payload.get("usageMetadata", {}), "promptTokenCount", "candidatesTokenCount")
        candidate = payload["candidates"][0]
        if candidate.get("finishReason") != "STOP":
            raise ValueError("Incomplete or blocked response")
        content = "".join(part.get("text", "") for part in candidate["content"]["parts"]
                          if not part.get("thought"))
        return json.loads(content)
