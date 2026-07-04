from fastapi.testclient import TestClient

from app.models.gruppe import Gruppe
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def test_dienst_typ_anlegen_und_auflisten(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    filtertags: dict,
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen",
        json={
            "name": "Weihrauch",
            "standard_anzahl": 2,
            "erforderliche_filtertags": ["arbeiter"],
            "gruppen_anforderungen": [{"gruppe_id": gruppe.id, "mindest_anzahl": 1}],
            "zeige_label": True,
        },
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Weihrauch"
    assert body["standard_anzahl"] == 2
    assert body["erforderliche_filtertags"] == ["arbeiter"]
    assert body["zeige_label"] is True
    assert [a["gruppe"]["id"] for a in body["gruppen_anforderungen"]] == [gruppe.id]
    assert [a["mindest_anzahl"] for a in body["gruppen_anforderungen"]] == [1]

    response = client.get(f"/api/pfarreien/{pfarrei.id}/dienst-typen", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_dienst_typ_anlegen_mit_unbekanntem_filtertag_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen",
        json={
            "name": "Weihrauch",
            "standard_anzahl": 2,
            "erforderliche_filtertags": ["arbeiter"],
            "gruppen_anforderungen": [],
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_dienst_typ_anlegen_mit_fremder_gruppe_abgelehnt(
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
        f"/api/pfarreien/{pfarrei.id}/dienst-typen",
        json={
            "name": "Weihrauch",
            "standard_anzahl": 2,
            "erforderliche_filtertags": [],
            "gruppen_anforderungen": [{"gruppe_id": fremde_gruppe.id, "mindest_anzahl": 1}],
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_dienst_typ_anlegen_mindestanzahl_ueber_standard_anzahl_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen",
        json={
            "name": "Weihrauch",
            "standard_anzahl": 1,
            "erforderliche_filtertags": [],
            "gruppen_anforderungen": [{"gruppe_id": gruppe.id, "mindest_anzahl": 2}],
        },
        headers=headers,
    )
    assert response.status_code == 422


def test_dienst_typ_anlegen_doppelter_name_konflikt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    daten = {
        "name": "Kreuz",
        "standard_anzahl": 1,
        "erforderliche_filtertags": [],
        "gruppen_anforderungen": [],
    }
    client.post(f"/api/pfarreien/{pfarrei.id}/dienst-typen", json=daten, headers=headers)
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen", json=daten, headers=headers
    )
    assert response.status_code == 409


def test_dienst_typ_bearbeiten(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, filtertags: dict
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen",
        json={
            "name": "Leuchter",
            "standard_anzahl": 2,
            "erforderliche_filtertags": [],
            "gruppen_anforderungen": [],
        },
        headers=headers,
    ).json()

    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen/{erstellt['id']}",
        json={
            "name": "Leuchter",
            "standard_anzahl": 3,
            "erforderliche_filtertags": ["grundschueler"],
            "gruppen_anforderungen": [],
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["standard_anzahl"] == 3
    assert response.json()["erforderliche_filtertags"] == ["grundschueler"]


def test_dienst_typ_loeschen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei
) -> None:
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen",
        json={
            "name": "Buch",
            "standard_anzahl": 1,
            "erforderliche_filtertags": [],
            "gruppen_anforderungen": [],
        },
        headers=headers,
    ).json()

    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/dienst-typen/{erstellt['id']}", headers=headers
    )
    assert response.status_code == 204

    response = client.get(f"/api/pfarreien/{pfarrei.id}/dienst-typen", headers=headers)
    assert response.json() == []


def test_dienst_typen_zugriff_auf_fremde_pfarrei_verweigert(
    client: TestClient, verantwortlicher_user: Nutzer, db_session
) -> None:
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.get(f"/api/pfarreien/{andere_pfarrei.id}/dienst-typen", headers=headers)
    assert response.status_code == 403
