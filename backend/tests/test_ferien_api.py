import pytest
from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from app.services import ferien_sync
from tests.conftest import auth_headers


def test_bundesland_setzen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/bundesland",
        json={"bundesland": "NW"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["bundesland"] == "NW"


def test_ferien_aktualisieren_ruft_sync_auf(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_sync(pfarrei_arg, db):
        return []

    monkeypatch.setattr("app.api.pfarreien.sync_ferien", fake_sync)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/ferien/aktualisieren", headers=headers
    )
    assert response.status_code == 200
    assert response.json() == []


def test_ferien_aktualisieren_gibt_502_bei_netzwerkfehler(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_sync(pfarrei_arg, db):
        raise ferien_sync.FerienSyncFehler("nicht erreichbar")

    monkeypatch.setattr("app.api.pfarreien.sync_ferien", fake_sync)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/ferien/aktualisieren", headers=headers
    )
    assert response.status_code == 502


def test_ferien_liste_ohne_verantwortlichen_verweigert(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/ferien", headers=headers)
    assert response.status_code == 403
