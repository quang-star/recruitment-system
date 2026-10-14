"""Groq transport using the same grounded extraction checks as Gemini."""
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, build_opener

from app.shared.source_extraction import SourceExtractor, _NoRedirect, _PROMPT, _response_schema


class GroqExtractor(SourceExtractor):
    provider = "groq"

    def _keys(self) -> list[str]:
        key = self.settings.groq_api_key.get_secret_value()
        return [key] if key else []

    def _generate(self, kind: str, source: str) -> dict:
        return self.generate_json(_PROMPT, {"documentType": kind, "document": source}, _response_schema(kind))

    def generate_json(self, prompt: str, document: dict, schema: dict) -> dict:
        model = self.settings.groq_model
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,119}", model):
            raise ValueError("Unsupported extraction model")
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(document, ensure_ascii=False)},
            ],
            "temperature": 0,
            "max_completion_tokens": self.settings.groq_max_output_tokens,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "source_sections", "strict": True, "schema": schema,
            }},
        }
        effort = getattr(self.settings, "groq_reasoning_effort", "auto")
        if effort == "auto":
            effort = "none" if model == "qwen/qwen3.8-27b" else "low" if model.startswith("openai/gpt-oss-") else None
        if effort:
            body["reasoning_effort"] = effort
        request = Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "User-Agent": "smart-recruitment-ai/1.0",
                     "Authorization": "Bearer " + self.settings.groq_api_key.get_secret_value()},
        )
        try:
            with build_opener(_NoRedirect()).open(request, timeout=self.settings.groq_timeout_seconds) as response:
                raw = response.read(262145)
        except HTTPError as error:
            error.close()
            raise ValueError("Groq request rejected") from None
        if len(raw) > 262144:
            raise ValueError("Response too large")
        payload = json.loads(raw)
        if "error" in payload:
            raise ValueError("Groq provider error")
        self.record_usage(payload.get("usage", {}), "prompt_tokens", "completion_tokens")
        choice = payload["choices"][0]
        if choice.get("finish_reason") != "stop" or choice["message"].get("refusal"):
            raise ValueError("Incomplete or refused response")
        return json.loads(choice["message"]["content"])
