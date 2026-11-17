"""Opt-in 9Router transport; grounded validation remains in SourceExtractor."""
import json
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

from app.extraction.source_extraction import SourceExtractor, _NoRedirect, _PROMPT, _response_schema


class Router9Extractor(SourceExtractor):
    provider = "router9"

    def _keys(self) -> list[str]:
        key = self.settings.router9_api_key.get_secret_value()
        return [key] if key and self.model else []

    def _generate(self, kind: str, source: str) -> dict:
        return self.generate_json(_PROMPT, {"documentType": kind, "document": source}, _response_schema(kind))

    def generate_json(self, prompt: str, document: dict, schema: dict) -> dict:
        base = self.settings.router9_base_url.rstrip("/")
        url = urlsplit(base)
        if (url.scheme not in ("http", "https") or not url.hostname
                or url.username is not None or url.password is not None or url.query or url.fragment
                or (url.scheme == "http" and url.hostname not in
                    ("localhost", "127.0.0.1", "::1", "host.docker.internal"))):
            raise ValueError("Unsupported 9Router endpoint")
        if not self._keys():
            raise ValueError("9Router model and key are required")
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(document, ensure_ascii=False)},
            ],
            "temperature": 0,
            "max_tokens": self.settings.router9_max_output_tokens,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "source_sections", "strict": True, "schema": schema,
            }},
        }
        request = Request(
            base + "/chat/completions", data=json.dumps(body).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "User-Agent": "smart-recruitment-ai/1.0",
                     "Authorization": "Bearer " + self.settings.router9_api_key.get_secret_value()},
        )
        try:
            with build_opener(_NoRedirect()).open(request, timeout=self.settings.router9_timeout_seconds) as response:
                raw = response.read(262145)
        except HTTPError as error:
            error.close()
            raise ValueError("9Router request rejected") from None
        if len(raw) > 262144:
            raise ValueError("Response too large")
        payload = json.loads(raw)
        if "error" in payload:
            raise ValueError("9Router provider error")
        self.record_usage(payload.get("usage", {}), "prompt_tokens", "completion_tokens")
        choice = payload["choices"][0]
        if choice.get("finish_reason") != "stop" or choice["message"].get("refusal"):
            raise ValueError("Incomplete or refused response")
        return json.loads(choice["message"]["content"])
