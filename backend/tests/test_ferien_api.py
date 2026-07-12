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


def test_bundesland_setzen_triggert_ferien_sync(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    aufrufe = []

    def fake_sync(pfarrei_arg, db):
        aufrufe.append(pfarrei_arg.bundesland)
        return []

    monkeypatch.setattr("app.api.pfarreien.sync_ferien", fake_sync)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/bundesland",
        json={"bundesland": "NW"},
        headers=headers,
    )
    assert response.status_code == 200
    assert len(aufrufe) == 1


def test_bundesland_setzen_ignoriert_ferien_sync_fehler(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_sync(pfarrei_arg, db):
        raise ferien_sync.FerienSyncFehler("nicht erreichbar")

    monkeypatch.setattr("app.api.pfarreien.sync_ferien", fake_sync)

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
    response = client.post(f"/api/pfarreien/{pfarrei.id}/ferien/aktualisieren", headers=headers)
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
    response = client.post(f"/api/pfarreien/{pfarrei.id}/ferien/aktualisieren", headers=headers)
    assert response.status_code == 502


def test_ferien_liste_ohne_verantwortlichen_verweigert(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/ferien", headers=headers)
    assert response.status_code == 403


def test_ferien_liste_mit_jahr_synct_fehlendes_jahr_automatisch(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    aufrufe = []

    def fake_sync_falls_fehlend(pfarrei_arg, db, jahre):
        aufrufe.append(jahre)
        return []

    monkeypatch.setattr("app.api.pfarreien.sync_ferien_falls_fehlend", fake_sync_falls_fehlend)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/ferien?jahr=2030", headers=headers)
    assert response.status_code == 200
    assert aufrufe == [{2030}]


def test_ferien_liste_ohne_jahr_synct_nicht(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_sync_falls_fehlend(pfarrei_arg, db, jahre):
        raise AssertionError("sollte ohne ?jahr nicht aufgerufen werden")

    monkeypatch.setattr("app.api.pfarreien.sync_ferien_falls_fehlend", fake_sync_falls_fehlend)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/ferien", headers=headers)
    assert response.status_code == 200


def test_ferien_liste_mit_jahr_ignoriert_sync_fehler(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_sync_falls_fehlend(pfarrei_arg, db, jahre):
        raise ferien_sync.FerienSyncFehler("nicht erreichbar")

    monkeypatch.setattr("app.api.pfarreien.sync_ferien_falls_fehlend", fake_sync_falls_fehlend)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/ferien?jahr=2030", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
