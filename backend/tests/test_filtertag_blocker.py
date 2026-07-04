from fastapi.testclient import TestClient

from app.models.filtertag import Filtertag
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_filtertag_blocker_anlegen_und_auflisten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, filtertags: dict
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker",
        json={
            "filtertag_id": filtertags["schueler"].id,
            "wochentag": 0,
            "start_zeit": "08:00:00",
            "end_zeit": "13:00:00",
        },
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["filtertag_id"] == filtertags["schueler"].id
    assert body["wochentag"] == 0
    assert body["start_zeit"] == "08:00:00"
    assert body["end_zeit"] == "13:00:00"

    response = client.get(f"/api/pfarreien/{pfarrei.id}/filtertag-blocker", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_filtertag_blocker_anlegen_mit_fremdem_filtertag_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    fremder_filtertag = Filtertag(
        pfarrei_id=andere_pfarrei.id, key="arbeiter", label="Arbeiter", ist_schueler_artig=False
    )
    db_session.add(fremder_filtertag)
    db_session.commit()
    db_session.refresh(fremder_filtertag)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker",
        json={
            "filtertag_id": fremder_filtertag.id,
            "wochentag": 0,
            "start_zeit": "08:00:00",
            "end_zeit": "13:00:00",
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_filtertag_blocker_endzeit_vor_startzeit_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, filtertags: dict
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker",
        json={
            "filtertag_id": filtertags["schueler"].id,
            "wochentag": 0,
            "start_zeit": "13:00:00",
            "end_zeit": "08:00:00",
        },
        headers=headers,
    )
    assert response.status_code == 422


def test_filtertag_blocker_bearbeiten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, filtertags: dict
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker",
        json={
            "filtertag_id": filtertags["grundschueler"].id,
            "wochentag": 1,
            "start_zeit": "08:00:00",
            "end_zeit": "12:00:00",
        },
        headers=headers,
    ).json()

    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker/{erstellt['id']}",
        json={
            "filtertag_id": filtertags["grundschueler"].id,
            "wochentag": 1,
            "start_zeit": "08:00:00",
            "end_zeit": "13:00:00",
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["end_zeit"] == "13:00:00"


def test_filtertag_blocker_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, filtertags: dict
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker",
        json={
            "filtertag_id": filtertags["arbeiter"].id,
            "wochentag": 2,
            "start_zeit": "07:00:00",
            "end_zeit": "16:00:00",
        },
        headers=headers,
    ).json()

    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/filtertag-blocker/{erstellt['id']}", headers=headers
    )
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/filtertag-blocker", headers=headers)
    assert response.json() == []


def test_filtertag_blocker_zugriff_auf_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(
        f"/api/pfarreien/{andere_pfarrei.id}/filtertag-blocker", headers=headers
    )
    assert response.status_code == 403
