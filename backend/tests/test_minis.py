from fastapi.testclient import TestClient

from app.models.gruppe import Gruppe
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_mini_anlegen_und_auflisten(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    filtertags: dict,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/minis",
        json={"name": "Max Muster", "gruppe_id": gruppe.id, "filtertags": ["schueler"]},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Max Muster"
    assert body["filtertags"] == ["schueler"]

    response = client.get(f"/api/pfarreien/{pfarrei.id}/minis", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_mini_anlegen_mit_fremder_gruppe_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    fremde_gruppe = Gruppe(pfarrei_id=andere_pfarrei.id, name="Fremd")
    db_session.add(fremde_gruppe)
    db_session.commit()
    db_session.refresh(fremde_gruppe)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/minis",
        json={"name": "Max Muster", "gruppe_id": fremde_gruppe.id, "filtertags": []},
        headers=headers,
    )
    assert response.status_code == 400


def test_mini_anlegen_mit_unbekanntem_filtertag_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/minis",
        json={"name": "Max Muster", "gruppe_id": gruppe.id, "filtertags": ["schueler"]},
        headers=headers,
    )
    assert response.status_code == 400


def test_mini_bearbeiten(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    filtertags: dict,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/minis",
        json={"name": "Max Muster", "gruppe_id": gruppe.id, "filtertags": []},
        headers=headers,
    ).json()

    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/minis/{erstellt['id']}",
        json={"name": "Moritz Muster", "gruppe_id": gruppe.id, "filtertags": ["arbeiter"]},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Moritz Muster"
    assert response.json()["filtertags"] == ["arbeiter"]


def test_mini_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/minis",
        json={"name": "Max Muster", "gruppe_id": gruppe.id, "filtertags": []},
        headers=headers,
    ).json()

    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/minis/{erstellt['id']}", headers=headers
    )
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/minis", headers=headers)
    assert response.json() == []


def test_minis_zugriff_auf_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{andere_pfarrei.id}/minis", headers=headers)
    assert response.status_code == 403
