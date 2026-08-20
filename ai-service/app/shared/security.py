from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from app.shared.api import ApiContractError
from app.shared.config import get_settings

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class AuthenticatedPrincipal:
    subject: UUID
    roles: tuple[str, ...]


class JwtVerifier:
    def __init__(
        self,
        jwks_uri: str,
        issuer: str,
        audience: str,
        cache_seconds: int = 300,
        jwks_client: Any | None = None,
    ):
        self._issuer = issuer
        self._audience = audience
        self._jwks_client = jwks_client or PyJWKClient(
            jwks_uri,
            cache_jwk_set=True,
            lifespan=cache_seconds,
        )

    def verify(self, token: str) -> AuthenticatedPrincipal:
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            )
            subject = UUID(claims["sub"])
            raw_roles = claims.get("roles", [])
            if not isinstance(raw_roles, list) or not all(isinstance(role, str) for role in raw_roles):
                raise InvalidTokenError("roles claim must be a list of strings")
            return AuthenticatedPrincipal(subject=subject, roles=tuple(raw_roles))
        except PyJWKClientConnectionError as exception:
            raise ApiContractError(
                503,
                "AUTH_KEYSET_UNAVAILABLE",
                "Authentication key set is temporarily unavailable",
            ) from exception
        except (InvalidTokenError, PyJWKClientError, KeyError, TypeError, ValueError) as exception:
            raise _invalid_token() from exception


@lru_cache
def get_jwt_verifier() -> JwtVerifier:
    settings = get_settings()
    return JwtVerifier(
        jwks_uri=settings.auth_jwks_uri,
        issuer=settings.auth_jwt_issuer,
        audience=settings.auth_jwt_audience,
        cache_seconds=settings.auth_jwks_cache_seconds,
    )


def require_access_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedPrincipal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _invalid_token()
    return get_jwt_verifier().verify(credentials.credentials)


def _invalid_token() -> ApiContractError:
    return ApiContractError(
        401,
        "INVALID_ACCESS_TOKEN",
        "A valid bearer access token is required",
        headers={"WWW-Authenticate": "Bearer"},
    )
