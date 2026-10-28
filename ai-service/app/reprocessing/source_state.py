import json
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

from app.reprocessing.models import EligibilityRequest, EligibilityResponse
from app.shared.source_extraction import _NoRedirect


class ReprocessingFailure(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code, self.retryable = code, retryable


class SourceStateReader(Protocol):
    def check(self, request: EligibilityRequest, bearer: str) -> EligibilityResponse: ...


class HttpSourceStateReader:
    def __init__(self, url: str, timeout: float = 3):
        parsed = urlsplit(url)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path != "/api/v2/dashboard/reprocessing/eligibility"):
            raise ValueError("Invalid Core eligibility endpoint")
        self.url, self.timeout = url, timeout

    def check(self, request: EligibilityRequest, bearer: str) -> EligibilityResponse:
        # The verified operator credential lives in memory for this request only.
        message = Request(self.url, data=json.dumps(request.model_dump(mode="json", exclude_none=True)).encode(),
                          headers={"Authorization": bearer, "Content-Type": "application/json", "Accept": "application/json"})
        try:
            with build_opener(_NoRedirect()).open(message, timeout=self.timeout) as response:
                raw = response.read(16385)
            if len(raw) > 16384:
                raise ValueError("Response too large")
            result = EligibilityResponse.model_validate_json(raw)
            if result.eligible != (result.reasonCode == "LIVE"):
                raise ValueError("Inconsistent source state")
            return result
        except HTTPError as error:
            error.close()
            raise ReprocessingFailure("CORE_ELIGIBILITY_UNAVAILABLE", retryable=True) from None
        except (URLError, OSError, ValueError):
            raise ReprocessingFailure("CORE_ELIGIBILITY_UNAVAILABLE", retryable=True) from None
