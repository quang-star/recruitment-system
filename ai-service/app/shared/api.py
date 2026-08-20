from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

CORRELATION_HEADER = "X-Correlation-Id"


class ApiError(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    correlationId: UUID
    timestamp: datetime


def _correlation_id(candidate: str | None) -> UUID:
    try:
        return UUID(candidate) if candidate else uuid4()
    except ValueError:
        return uuid4()


def install_api_conventions(app: FastAPI) -> None:
    @app.middleware("http")
    async def correlation_middleware(request: Request, call_next):
        correlation_id = _correlation_id(request.headers.get(CORRELATION_HEADER))
        request.state.correlation_id = correlation_id
        response = await call_next(request)
        response.headers[CORRELATION_HEADER] = str(correlation_id)
        return response

    @app.exception_handler(ApiContractError)
    async def contract_error_handler(request: Request, exception: "ApiContractError") -> JSONResponse:
        body = ApiError(
            code=exception.code,
            message=str(exception),
            details=exception.details,
            correlationId=getattr(request.state, "correlation_id", uuid4()),
            timestamp=datetime.now(UTC),
        )
        return JSONResponse(
            status_code=exception.status_code,
            content=body.model_dump(mode="json"),
            headers=exception.headers,
        )


class ApiContractError(RuntimeError):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.details = details or {}
        self.headers = headers or {}
