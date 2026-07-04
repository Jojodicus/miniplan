from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer


def test_login_erfolgreich(client: TestClient, admin_user: Nutzer) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "geheim123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_falsches_passwort(client: TestClient, admin_user: Nutzer) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "falsch"}
    )
    assert response.status_code == 401


def test_login_unbekannter_nutzer(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "unbekannt@example.com", "password": "geheim123"}
    )
    assert response.status_code == 401


def test_me_ohne_token(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_mit_ungueltigem_token(client: TestClient) -> None:
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer ungueltig"})
    assert response.status_code == 401


def test_me_mit_gueltigem_token(client: TestClient, admin_user: Nutzer) -> None:
    login = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "geheim123"}
    )
    token = login.json()["access_token"]
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.com"
    assert response.json()["ist_admin"] is True
