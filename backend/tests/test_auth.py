from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.security import ACCESS_TOKEN_COOKIE_NAME


def test_login_erfolgreich(client: TestClient, admin_user: Nutzer) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "geheim123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert response.cookies[ACCESS_TOKEN_COOKIE_NAME] == body["access_token"]


def test_login_falsches_passwort(client: TestClient, admin_user: Nutzer) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "falsch"}
    )
    assert response.status_code == 401


def test_login_email_ist_case_insensitiv(client: TestClient, admin_user: Nutzer) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": "Admin@Example.com", "password": "geheim123"},
    )
    assert response.status_code == 200


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


def test_me_mit_cookie_ohne_authorization_header(client: TestClient, admin_user: Nutzer) -> None:
    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "geheim123"})
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.com"


def test_logout_entfernt_cookie(client: TestClient, admin_user: Nutzer) -> None:
    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "geheim123"})
    assert client.get("/api/auth/me").status_code == 200

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 204

    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_login_wird_nach_zu_vielen_versuchen_rate_limitiert(
    client: TestClient, admin_user: Nutzer
) -> None:
    for _ in range(10):
        response = client.post(
            "/api/auth/login", json={"email": "admin@example.com", "password": "falsch"}
        )
        assert response.status_code == 401

    response = client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": "geheim123"}
    )
    assert response.status_code == 429


def test_security_header_werden_gesetzt(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"] == "default-src 'self'"


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
