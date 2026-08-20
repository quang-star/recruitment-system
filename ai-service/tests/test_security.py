from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.main import app
from app.shared.api import ApiContractError
from app.shared.security import JwtVerifier


class StaticJwksClient:
    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return SimpleNamespace(key=self.public_key)


def test_health_is_public() -> None:
    response = TestClient(app).get("/actuator/health")
    assert response.status_code == 200


def test_ai_task_endpoint_requires_bearer_token() -> None:
    response = TestClient(app).get(f"/api/v1/ai-tasks/{uuid4()}")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["code"] == "INVALID_ACCESS_TOKEN"


def test_verifier_accepts_expected_issuer_and_audience() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = uuid4()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "iss": "https://issuer.test",
            "aud": ["smart-recruitment-api"],
            "sub": str(subject),
            "roles": ["CANDIDATE"],
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )
    verifier = JwtVerifier(
        "https://issuer.test/jwks.json",
        "https://issuer.test",
        "smart-recruitment-api",
        jwks_client=StaticJwksClient(private_key.public_key()),
    )

    principal = verifier.verify(token)

    assert principal.subject == subject
    assert principal.roles == ("CANDIDATE",)


def test_verifier_rejects_wrong_audience() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "iss": "https://issuer.test",
            "aud": ["another-api"],
            "sub": str(uuid4()),
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
    )
    verifier = JwtVerifier(
        "https://issuer.test/jwks.json",
        "https://issuer.test",
        "smart-recruitment-api",
        jwks_client=StaticJwksClient(private_key.public_key()),
    )

    with pytest.raises(ApiContractError) as captured:
        verifier.verify(token)

    assert captured.value.status_code == 401
    assert captured.value.code == "INVALID_ACCESS_TOKEN"
