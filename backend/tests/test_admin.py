from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import _create_user, auth_headers


def test_admin_endpunkte_nur_fuer_admins(client: TestClient, verantwortlicher_user: Nutzer) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    assert client.get("/api/admin/nutzer", headers=headers).status_code == 403


def test_admin_endpunkte_erfordern_authentifizierung(client: TestClient) -> None:
    assert client.get("/api/admin/nutzer").status_code == 401


def test_nutzer_anlegen_bearbeiten_passwort_loeschen(
    client: TestClient, admin_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")

    response = client.post(
        "/api/admin/nutzer",
        json={"email": "Neu@Example.com", "password": "geheim123", "ist_admin": False},
        headers=headers,
    )
    assert response.status_code == 201
    neuer_id = response.json()["id"]
    assert response.json()["email"] == "neu@example.com"

    # Doppelte E-Mail -> Konflikt.
    response = client.post(
        "/api/admin/nutzer",
        json={"email": "neu@example.com", "password": "geheim123", "ist_admin": False},
        headers=headers,
    )
    assert response.status_code == 409

    # Zu kurzes Passwort -> Validierungsfehler.
    response = client.post(
        "/api/admin/nutzer",
        json={"email": "kurz@example.com", "password": "kurz", "ist_admin": False},
        headers=headers,
    )
    assert response.status_code == 422

    # Rolle zuweisen.
    response = client.put(
        f"/api/admin/nutzer/{neuer_id}/pfarrei-rollen",
        json={"pfarrei_id": pfarrei.id, "rolle": "pfarrei_verantwortlicher"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["pfarrei_rollen"] == [
        {"pfarrei_id": pfarrei.id, "rolle": "pfarrei_verantwortlicher"}
    ]

    # Rolle ändern (Upsert, kein Duplikat).
    response = client.put(
        f"/api/admin/nutzer/{neuer_id}/pfarrei-rollen",
        json={"pfarrei_id": pfarrei.id, "rolle": "betrachter"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["pfarrei_rollen"] == [{"pfarrei_id": pfarrei.id, "rolle": "betrachter"}]

    # Rolle entfernen.
    response = client.request(
        "DELETE", f"/api/admin/nutzer/{neuer_id}/pfarrei-rollen/{pfarrei.id}", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["pfarrei_rollen"] == []

    # Passwort zurücksetzen -> danach ist der neue Login gültig.
    response = client.post(
        f"/api/admin/nutzer/{neuer_id}/passwort",
        json={"password": "neuespasswort"},
        headers=headers,
    )
    assert response.status_code == 204
    login = client.post(
        "/api/auth/login", json={"email": "neu@example.com", "password": "neuespasswort"}
    )
    assert login.status_code == 200

    # Löschen.
    response = client.delete(f"/api/admin/nutzer/{neuer_id}", headers=headers)
    assert response.status_code == 204


def test_admin_kann_sich_nicht_selbst_loeschen(client: TestClient, admin_user: Nutzer) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.delete(f"/api/admin/nutzer/{admin_user.id}", headers=headers)
    assert response.status_code == 409


def test_letzter_admin_kann_nicht_geloescht_oder_herabgestuft_werden(
    client: TestClient, admin_user: Nutzer, db_session
) -> None:
    # Zweiter Admin, der die Aktion ausführt, damit die Selbst-Löschsperre nicht greift.
    zweiter = _create_user(db_session, "admin2@example.com", "geheim123", ist_admin=True)
    headers = auth_headers(client, "admin2@example.com", "geheim123")

    # admin_user löschen -> zweiter bleibt, ok.
    assert client.delete(f"/api/admin/nutzer/{admin_user.id}", headers=headers).status_code == 204

    # Jetzt ist "zweiter" der letzte Admin: Herabstufen und Löschen (via eigenem Account) sind
    # gesperrt.
    response = client.put(
        f"/api/admin/nutzer/{zweiter.id}",
        json={"email": "admin2@example.com", "ist_admin": False},
        headers=headers,
    )
    assert response.status_code == 409


def test_pfarrei_crud_mit_seed(client: TestClient, admin_user: Nutzer) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")

    response = client.post("/api/admin/pfarreien", json={"name": "St. Neu"}, headers=headers)
    assert response.status_code == 201
    pfarrei_id = response.json()["id"]
    assert response.json()["hat_bild"] is False

    # Default-Stammdaten (Filtertags) wurden angelegt.
    response = client.get(f"/api/pfarreien/{pfarrei_id}/filtertags", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) > 0

    # Umbenennen.
    response = client.put(
        f"/api/admin/pfarreien/{pfarrei_id}", json={"name": "St. Umbenannt"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == "St. Umbenannt"

    # Doppelter Name -> Konflikt.
    client.post("/api/admin/pfarreien", json={"name": "St. Zwei"}, headers=headers)
    response = client.put(
        f"/api/admin/pfarreien/{pfarrei_id}", json={"name": "St. Zwei"}, headers=headers
    )
    assert response.status_code == 409

    # Löschen.
    response = client.delete(f"/api/admin/pfarreien/{pfarrei_id}", headers=headers)
    assert response.status_code == 204
