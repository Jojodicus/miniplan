from fastapi.testclient import TestClient

from app.models.miniplan import Miniplan
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def _leerer_vorschau_body(monat: int = 7, jahr: int = 2026) -> dict:
    return {"monat": monat, "jahr": jahr, "gottesdienste": []}


def test_vorschau_erfordert_pfarrei_zugriff(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/vorschau",
        json=_leerer_vorschau_body(),
        headers=headers,
    )
    assert response.status_code == 403


def test_vorschau_unbekannter_miniplan_404(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/999/vorschau",
        json=_leerer_vorschau_body(),
        headers=headers,
    )
    assert response.status_code == 404


def test_vorschau_liefert_pdf(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/vorschau",
        json={
            "monat": 7,
            "jahr": 2026,
            "veranstaltungen": "Pfarrfest",
            "ankuendigungen": None,
            "gottesdienste": [
                {
                    "datum": "2026-07-05",
                    "uhrzeit": "10:00:00",
                    "name": "Sonntagsmesse",
                    "dienstbedarf": [
                        {
                            "name": "Weihrauch",
                            "anzahl": 2,
                            "erforderliche_filtertags": [],
                            "gruppen_anforderungen": [
                                {"gruppe_name": "Obermini", "mindest_anzahl": 1}
                            ],
                            "zugewiesene_minis": ["Max Mustermann"],
                        }
                    ],
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_vorschau_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    miniplan = Miniplan(pfarrei_id=andere_pfarrei.id, monat=7, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{andere_pfarrei.id}/miniplaene/{miniplan.id}/vorschau",
        json=_leerer_vorschau_body(),
        headers=headers,
    )
    assert response.status_code == 403
