from fastapi.testclient import TestClient

from app.models.dienst_typ import DienstTyp, DienstTypGruppenAnforderung
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_gruppen_liste_erfordert_pfarrei_zugriff(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/gruppen", headers=headers)
    assert response.status_code == 403


def test_gruppe_anlegen_und_auflisten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/gruppen", json={"name": "Obermini"}, headers=headers
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Obermini"

    response = client.get(f"/api/pfarreien/{pfarrei.id}/gruppen", headers=headers)
    assert response.status_code == 200
    assert [g["name"] for g in response.json()] == ["Obermini"]


def test_gruppe_anlegen_doppelter_name_konflikt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/gruppen", json={"name": gruppe.name}, headers=headers
    )
    assert response.status_code == 409


def test_gruppe_bearbeiten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/gruppen/{gruppe.id}",
        json={"name": "Neue Gruppe"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Neue Gruppe"


def test_gruppe_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.delete(f"/api/pfarreien/{pfarrei.id}/gruppen/{gruppe.id}", headers=headers)
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/gruppen", headers=headers)
    assert response.json() == []


def test_gruppe_loeschen_verweigert_wenn_von_mini_verwendet(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    db_session,
) -> None:
    db_session.add(Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Max Muster"))
    db_session.commit()

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.delete(f"/api/pfarreien/{pfarrei.id}/gruppen/{gruppe.id}", headers=headers)
    assert response.status_code == 409


def test_gruppe_loeschen_raeumt_nur_eigene_dienst_typ_anforderung(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    db_session,
) -> None:
    andere_gruppe = Gruppe(pfarrei_id=pfarrei.id, name="Andere Gruppe")
    db_session.add(andere_gruppe)
    db_session.flush()

    dienst_typ = DienstTyp(pfarrei_id=pfarrei.id, name="Kerzentraeger", standard_anzahl=2)
    dienst_typ.gruppen_anforderungen = [
        DienstTypGruppenAnforderung(gruppe_id=gruppe.id, mindest_anzahl=1),
        DienstTypGruppenAnforderung(gruppe_id=andere_gruppe.id, mindest_anzahl=1),
    ]
    db_session.add(dienst_typ)
    db_session.commit()
    dienst_typ_id = dienst_typ.id

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.delete(f"/api/pfarreien/{pfarrei.id}/gruppen/{gruppe.id}", headers=headers)
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/dienst-typen", headers=headers)
    assert response.status_code == 200
    [dienst_typ_json] = [d for d in response.json() if d["id"] == dienst_typ_id]
    assert [a["gruppe"]["id"] for a in dienst_typ_json["gruppen_anforderungen"]] == [
        andere_gruppe.id
    ]


def test_gruppen_zugriff_auf_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{andere_pfarrei.id}/gruppen", headers=headers)
    assert response.status_code == 403


def test_gruppen_liste_als_admin(
    client: TestClient, admin_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{pfarrei.id}/gruppen", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_gruppen_liste_unbekannte_pfarrei(client: TestClient, admin_user: Nutzer) -> None:
    headers = auth_headers(client, "admin@example.com", "geheim123")
    response = client.get("/api/pfarreien/999/gruppen", headers=headers)
    assert response.status_code == 404
