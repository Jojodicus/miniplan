from fastapi.testclient import TestClient

from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_filtertag_anlegen_und_auflisten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertags",
        json={"label": "Azubi", "ist_schueler_artig": True},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["key"] == "azubi"
    assert body["label"] == "Azubi"
    assert body["ist_schueler_artig"] is True

    response = client.get(f"/api/pfarreien/{pfarrei.id}/filtertags", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_filtertag_anlegen_generiert_eindeutigen_key_bei_gleicher_bezeichnung(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erste = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertags",
        json={"label": "Azubi", "ist_schueler_artig": True},
        headers=headers,
    )
    zweite = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertags",
        json={"label": "Azubi", "ist_schueler_artig": False},
        headers=headers,
    )
    assert erste.status_code == 201
    assert zweite.status_code == 201
    assert erste.json()["key"] == "azubi"
    assert zweite.json()["key"] == "azubi-2"


def test_filtertag_bearbeiten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertags",
        json={"label": "Azubi", "ist_schueler_artig": True},
        headers=headers,
    ).json()

    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/filtertags/{erstellt['id']}",
        json={"label": "Auszubildende/r", "ist_schueler_artig": False},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "Auszubildende/r"
    assert body["ist_schueler_artig"] is False
    # key bleibt beim Umbenennen unverändert, da er in bestehenden Minis/DienstTypen als JSON-Key
    # referenziert wird.
    assert body["key"] == "azubi"


def test_filtertag_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertags",
        json={"label": "Azubi", "ist_schueler_artig": True},
        headers=headers,
    ).json()

    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/filtertags/{erstellt['id']}", headers=headers
    )
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/filtertags", headers=headers)
    assert response.json() == []


def test_filtertags_zugriff_auf_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{andere_pfarrei.id}/filtertags", headers=headers)
    assert response.status_code == 403
