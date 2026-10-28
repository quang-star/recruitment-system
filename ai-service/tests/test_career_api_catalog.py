from identity_fixtures import new_id
import json
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.career.api import get_career_service, router
from app.career.catalog_reader import HttpCoreCatalogReader, usable_catalog
from app.career.models import CareerRequest, CareerResponse
from app.shared.api import install_api_conventions
from app.shared.security import AuthenticatedPrincipal, require_access_token
from test_career_suggestions import catalog


@pytest.fixture
def client():
    app = FastAPI()
    install_api_conventions(app)
    app.include_router(router)
    actor = new_id()
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(
        actor, ("RECRUITER",)
    )
    service = Mock()
    service.suggest.return_value = CareerResponse(
        status="MANUAL",
        reasonCode="EXTERNAL_AI_NOT_CONFIGURED",
        inputHash="a" * 64,
        catalogHash=None,
        suggestions=[],
    )
    app.dependency_overrides[get_career_service] = lambda: service
    with TestClient(app) as api:
        yield api, app, actor, service


def test_draft_endpoint_binds_bounded_request_and_uses_authenticated_actor(client):
    api, _, actor, service = client
    response = api.post(
        "/api/v2/parsed-jds/category-suggestions", json={"title": "Backend"}
    )
    assert response.status_code == 200 and response.json()["status"] == "MANUAL"
    assert (
        response.json()["suggestions"] == [] and "X-Correlation-Id" in response.headers
    )
    service.suggest.assert_called_once_with(actor, CareerRequest(title="Backend"))


def test_draft_endpoint_requires_an_access_token(client):
    api, app, _, service = client
    app.dependency_overrides.pop(require_access_token)
    response = api.post("/api/v2/parsed-jds/category-suggestions", json={"title": "Backend"})
    assert response.status_code == 401 and response.json()["code"] == "INVALID_ACCESS_TOKEN"
    service.suggest.assert_not_called()


@pytest.mark.parametrize("roles", [("CANDIDATE",), ("SYSTEM_ADMIN",), ()])
def test_draft_endpoint_rejects_non_recruiters_before_service(client, roles):
    api, app, actor, service = client
    app.dependency_overrides[require_access_token] = lambda: AuthenticatedPrincipal(
        actor, roles
    )
    response = api.post(
        "/api/v2/parsed-jds/category-suggestions", json={"title": "Backend"}
    )
    assert (
        response.status_code == 403
        and response.json()["code"] == "RECRUITER_ROLE_REQUIRED"
    )
    service.suggest.assert_not_called()


@pytest.mark.parametrize(
    "payload",
    [
        {"title": " "},
        {"title": "x" * 241},
        {"title": "Backend", "description": "x" * 30001},
        {"title": "Backend", "externalAiConsent": 1},
        {"title": "Backend", "catalog": []},
        {"title": "Backend", "resourceId": str(new_id())},
    ],
)
def test_invalid_request_cannot_supply_identity_catalog_or_unbounded_content(
    client, payload
):
    api, _, _, service = client
    assert (
        api.post("/api/v2/parsed-jds/category-suggestions", json=payload).status_code
        == 422
    )
    service.suggest.assert_not_called()


def test_catalog_reader_uses_fixed_public_endpoint_bounded_transport_and_active_entries(
    monkeypatch,
):
    entries = catalog()
    response = Mock()
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    response.read.return_value = json.dumps(
        [entry.model_dump(mode="json") for entry in entries]
    ).encode()
    opener = Mock()
    opener.open.return_value = response
    monkeypatch.setattr("app.career.catalog_reader.build_opener", lambda *args: opener)
    reader = HttpCoreCatalogReader(
        "http://core-service:8082/api/v2/public/job-categories", 3
    )
    assert reader.read() == entries
    request = opener.open.call_args.args[0]
    assert (
        request.full_url == reader.url and request.get_header("Authorization") is None
    )
    assert opener.open.call_args.kwargs["timeout"] == 3
    response.read.assert_called_once_with(262145)
    response.read.return_value = b"x" * 262145
    with pytest.raises(ValueError):
        reader.read()
    raw = [entry.model_dump(mode="json") for entry in entries]
    raw[0]["status"] = "PENDING"
    response.read.return_value = json.dumps(raw).encode()
    with pytest.raises(ValueError):
        reader.read()


@pytest.mark.parametrize(
    "url",
    [
        "file:///tmp/catalog",
        "http://user:secret@core-service/api/v2/public/job-categories",
        "http://core-service/api/v2/public/job-categories?destination=x",
        "http://core-service/api/v2/dashboard/catalog",
    ],
)
def test_catalog_endpoint_cannot_select_another_path_or_transport(monkeypatch, url):
    monkeypatch.setattr(
        "app.career.catalog_reader.build_opener",
        lambda *args: pytest.fail("Transport constructed"),
    )
    with pytest.raises(ValueError):
        HttpCoreCatalogReader(url, 3).read()


def test_orphaned_catalog_children_are_not_exposed_as_valid_suggestions():
    entries = catalog()
    assert usable_catalog(entries[1:]) == []
    assert usable_catalog([entries[0], entries[2]]) == [entries[0]]


@pytest.mark.parametrize(
    "name", ["private@example.test", "private＠example.test", "０９１２３４５６７８", "Masked █"]
)
def test_private_core_catalog_labels_and_their_descendants_are_excluded_without_mutation(name):
    entries = catalog()
    entries[1].name = name
    assert usable_catalog(entries) == [entries[0]]
    assert entries[1].name == name
