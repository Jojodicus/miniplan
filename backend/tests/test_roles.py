from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_pfarreien_liste_erfordert_admin(
    client: TestClient, verantwortlicher_user: Nutzer
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get("/api/pfarreien", headers=headers)
    assert response.status_code == 403


def test_pfarreien_liste_als_admin(client: TestClient, admin_user: Nutzer, pfarrei: Pfarrei) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.get("/api/pfarreien", headers=headers)
    assert response.status_code == 200
    assert [p["name"] for p in response.json()] == ["St. Beispiel"]


def test_pfarrei_detail_als_verantwortlicher_der_eigenen_pfarrei(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == pfarrei.id


def test_pfarrei_detail_als_betrachter_der_eigenen_pfarrei(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}", headers=headers)
    assert response.status_code == 200


def test_pfarrei_detail_verweigert_fuer_fremde_pfarrei(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{andere_pfarrei.id}", headers=headers)
    assert response.status_code == 403


def test_pfarrei_detail_als_admin_fuer_beliebige_pfarrei(
    client: TestClient, admin_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}", headers=headers)
    assert response.status_code == 200


def test_pfarrei_detail_ohne_authentifizierung(client: TestClient, pfarrei: Pfarrei) -> None:
    response = client.get(f"/api/pfarreien/{pfarrei.id}")
    assert response.status_code == 401


def test_pfarrei_detail_nicht_gefunden_als_admin(client: TestClient, admin_user: Nutzer) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.get("/api/pfarreien/999", headers=headers)
    assert response.status_code == 404
