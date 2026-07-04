from datetime import date

from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from app.services.feiertage import berechne_feiertage, default_arbeiter_frei
from tests.conftest import auth_headers


def test_berechne_feiertage_enthaelt_fronleichnam_in_bayern() -> None:
    feiertage = berechne_feiertage("BY", 2026)
    keys = {f["key"] for f in feiertage}
    assert "fronleichnam" in keys
    fronleichnam = next(f for f in feiertage if f["key"] == "fronleichnam")
    assert fronleichnam["datum"] == date(2026, 6, 4)


def test_default_arbeiter_frei_ist_true_fuer_gesetzliche_feiertage() -> None:
    # Alle von `holidays` gelieferten Feiertage sind gesetzliche, arbeitsfreie Feiertage.
    assert default_arbeiter_frei("fronleichnam") is True
    assert default_arbeiter_frei("neujahr") is True


def test_feiertage_liste_verwendet_defaults_ohne_einstellung(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(
        f"/api/pfarreien/{pfarrei.id}/feiertage", params={"jahr": 2026}, headers=headers
    )
    assert response.status_code == 200
    fronleichnam = next(f for f in response.json() if f["key"] == "fronleichnam")
    assert fronleichnam["schulfrei"] is True
    assert fronleichnam["arbeiter_frei"] is True


def test_feiertag_einstellung_setzen_und_abrufen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/feiertage/fronleichnam",
        json={"schulfrei": True, "arbeiter_frei": True},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.get(
        f"/api/pfarreien/{pfarrei.id}/feiertage", params={"jahr": 2026}, headers=headers
    )
    fronleichnam = next(f for f in response.json() if f["key"] == "fronleichnam")
    assert fronleichnam["arbeiter_frei"] is True


def test_feiertage_zugriff_ohne_verantwortlichen_verweigert(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/feiertage", headers=headers)
    assert response.status_code == 403
