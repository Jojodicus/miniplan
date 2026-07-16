from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import rate_limit
from app.models.einladung import Einladung
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def _erstellen(client: TestClient, pfarrei_id: int, headers: dict[str, str]) -> dict:
    response = client.post(
        f"/api/pfarreien/{pfarrei_id}/einladungen",
        json={"rolle": "betrachter"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_erstellen_erfordert_verantwortlich(
    client: TestClient,
    pfarrei: Pfarrei,
    verantwortlicher_user: Nutzer,
    betrachter_user: Nutzer,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    daten = _erstellen(client, pfarrei.id, headers)
    assert daten["rolle"] == "betrachter"
    assert "token" in daten and len(daten["token"]) > 10

    # Betrachter derselben Pfarrei darf nicht einladen
    betrachter_headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/einladungen",
        json={"rolle": "betrachter"},
        headers=betrachter_headers,
    )
    assert response.status_code == 403

    # anonym auch nicht - Cookie-Jar des TestClient trägt sonst noch das Cookie aus dem
    # letzten erfolgreichen Login (auth_headers loggt zusätzlich zum Bearer-Token auch das
    # Cookie ein) und würde die Anfrage fälschlich als eingeloggt erscheinen lassen.
    client.cookies.clear()
    response = client.post(f"/api/pfarreien/{pfarrei.id}/einladungen", json={"rolle": "betrachter"})
    assert response.status_code == 401

    # verantwortlicher einer anderen Pfarrei auch nicht
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    response = client.post(
        f"/api/pfarreien/{andere_pfarrei.id}/einladungen",
        json={"rolle": "betrachter"},
        headers=headers,
    )
    assert response.status_code == 403


def test_erstellen_lehnt_unerlaubte_rolle_ab(
    client: TestClient, pfarrei: Pfarrei, verantwortlicher_user: Nutzer
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/einladungen",
        json={"rolle": "pfarrei_verantwortlicher"},
        headers=headers,
    )
    assert response.status_code == 422


def test_liste_und_widerrufen(
    client: TestClient, pfarrei: Pfarrei, verantwortlicher_user: Nutzer
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = _erstellen(client, pfarrei.id, headers)

    response = client.get(f"/api/pfarreien/{pfarrei.id}/einladungen", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/einladungen/{erstellt['id']}", headers=headers
    )
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/einladungen", headers=headers)
    assert response.json() == []


def test_liste_zeigt_abgelaufene_nicht(
    client: TestClient,
    pfarrei: Pfarrei,
    verantwortlicher_user: Nutzer,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    _erstellen(client, pfarrei.id, headers)
    abgelaufen = db_session.query(Einladung).filter(Einladung.pfarrei_id == pfarrei.id).one()
    abgelaufen.laeuft_ab_am = datetime.now(UTC) - timedelta(days=1)
    db_session.commit()

    response = client.get(f"/api/pfarreien/{pfarrei.id}/einladungen", headers=headers)
    assert response.json() == []


def test_oeffentliche_vorschau(
    client: TestClient,
    pfarrei: Pfarrei,
    verantwortlicher_user: Nutzer,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = _erstellen(client, pfarrei.id, headers)

    response = client.get(f"/api/einladungen/{erstellt['token']}")
    assert response.status_code == 200
    daten = response.json()
    assert daten == {"pfarrei_name": pfarrei.name, "rolle": "betrachter", "gueltig": True}

    response = client.get("/api/einladungen/unbekannter-token")
    assert response.status_code == 404

    einladung = db_session.query(Einladung).filter(Einladung.pfarrei_id == pfarrei.id).one()
    einladung.laeuft_ab_am = datetime.now(UTC) - timedelta(days=1)
    db_session.commit()
    response = client.get(f"/api/einladungen/{erstellt['token']}")
    assert response.status_code == 200
    assert response.json()["gueltig"] is False


def test_annehmen_erfolg_und_zugriff(
    client: TestClient, pfarrei: Pfarrei, verantwortlicher_user: Nutzer
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = _erstellen(client, pfarrei.id, headers)

    response = client.post(
        f"/api/einladungen/{erstellt['token']}/annehmen",
        json={"email": "neuer-betrachter@example.com", "password": "geheim123"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    neue_headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/auth/me", headers=neue_headers)
    assert me.status_code == 200
    assert me.json()["email"] == "neuer-betrachter@example.com"
    assert me.json()["pfarrei_rollen"] == [{"pfarrei_id": pfarrei.id, "rolle": "betrachter"}]

    # Einladung ist jetzt eingelöst - erneutes Annehmen schlägt fehl
    response = client.post(
        f"/api/einladungen/{erstellt['token']}/annehmen",
        json={"email": "anderer@example.com", "password": "geheim123"},
    )
    assert response.status_code == 409

    # Betrachter darf keine verantwortlich-only-Endpunkte
    response = client.get(f"/api/pfarreien/{pfarrei.id}/gruppen", headers=neue_headers)
    assert response.status_code == 403


def test_annehmen_lehnt_unbekannten_abgelaufenen_und_duplikat_ab(
    client: TestClient,
    pfarrei: Pfarrei,
    verantwortlicher_user: Nutzer,
    betrachter_user: Nutzer,
    db_session: Session,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    response = client.post(
        "/api/einladungen/unbekannter-token/annehmen",
        json={"email": "x@example.com", "password": "geheim123"},
    )
    assert response.status_code == 404

    erstellt = _erstellen(client, pfarrei.id, headers)
    einladung = db_session.query(Einladung).filter(Einladung.pfarrei_id == pfarrei.id).one()
    einladung.laeuft_ab_am = datetime.now(UTC) - timedelta(days=1)
    db_session.commit()
    response = client.post(
        f"/api/einladungen/{erstellt['token']}/annehmen",
        json={"email": "x@example.com", "password": "geheim123"},
    )
    assert response.status_code == 409

    zweite = _erstellen(client, pfarrei.id, headers)
    response = client.post(
        f"/api/einladungen/{zweite['token']}/annehmen",
        json={"email": "betrachter@example.com", "password": "geheim123"},
    )
    assert response.status_code == 409


def test_annehmen_ist_rate_limitiert(client: TestClient) -> None:
    # Unauthentifizierte Account-Erstellung - ohne Rate-Limit ein unthrottelter Spam-Vektor.
    # Der Token ist unbekannt (404), das Limit greift trotzdem schon davor.
    for _ in range(rate_limit._MAX_ATTEMPTS):
        response = client.post(
            "/api/einladungen/unbekannter-token/annehmen",
            json={"email": "x@example.com", "password": "geheim123"},
        )
        assert response.status_code == 404

    response = client.post(
        "/api/einladungen/unbekannter-token/annehmen",
        json={"email": "x@example.com", "password": "geheim123"},
    )
    assert response.status_code == 429
