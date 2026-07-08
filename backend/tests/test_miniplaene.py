from fastapi.testclient import TestClient

from app.models.miniplan import Miniplan
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_miniplaene_liste_erfordert_pfarrei_zugriff(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/miniplaene", headers=headers)
    assert response.status_code == 403


def test_miniplan_anlegen_und_auflisten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene",
        json={"monat": 7, "jahr": 2026},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["monat"] == 7
    assert body["jahr"] == 2026
    assert body["status"] == "in_bearbeitung"
    assert body["gottesdienste"] == []

    response = client.get(f"/api/pfarreien/{pfarrei.id}/miniplaene", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_miniplan_anlegen_doppelter_monat_konflikt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    daten = {"monat": 8, "jahr": 2026}
    client.post(f"/api/pfarreien/{pfarrei.id}/miniplaene", json=daten, headers=headers)
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene", json=daten, headers=headers
    )
    assert response.status_code == 409


def test_miniplan_ungueltiger_monat_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene",
        json={"monat": 13, "jahr": 2026},
        headers=headers,
    )
    assert response.status_code == 422


def test_miniplan_detail(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=9, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["id"] == miniplan.id


def test_miniplan_bearbeiten_freitext(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=10, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}",
        json={"veranstaltungen": "Pfarrfest", "ankuendigungen": "Bitte pünktlich kommen"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["veranstaltungen"] == "Pfarrfest"
    assert response.json()["ankuendigungen"] == "Bitte pünktlich kommen"


def test_miniplan_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=11, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}", headers=headers
    )
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/miniplaene", headers=headers)
    assert response.json() == []


def test_miniplaene_zugriff_auf_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{andere_pfarrei.id}/miniplaene", headers=headers)
    assert response.status_code == 403


def test_miniplaene_liste_unbekannte_pfarrei(client: TestClient, admin_user: Nutzer) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.get("/api/pfarreien/999/miniplaene", headers=headers)
    assert response.status_code == 404


def test_miniplan_abschliessen_und_wieder_oeffnen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=1, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/status",
        json={"status": "abgeschlossen"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "abgeschlossen"

    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/status",
        json={"status": "in_bearbeitung"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "in_bearbeitung"


def test_miniplan_status_aendern_erfordert_verantwortlich(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=2, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/status",
        json={"status": "abgeschlossen"},
        headers=headers,
    )
    assert response.status_code == 403


def test_miniplan_pdf_download_erfordert_abgeschlossen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=3, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/pdf", headers=headers
    )
    assert response.status_code == 409


def test_miniplan_pdf_download_liefert_pdf_fuer_betrachter(
    client: TestClient, verantwortlicher_user: Nutzer, betrachter_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=4, jahr=2027, status="abgeschlossen")
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/pdf", headers=headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_miniplan_pdf_download_unbekannter_plan(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/999/pdf", headers=headers
    )
    assert response.status_code == 404
