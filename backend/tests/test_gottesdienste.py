from fastapi.testclient import TestClient

from app.models.dienst_typ import DienstTyp
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.nutzer import Nutzer
from app.models.pfarrei import Pfarrei
from tests.conftest import auth_headers


def _miniplan(db_session, pfarrei: Pfarrei, monat: int = 7, jahr: int = 2026) -> Miniplan:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=monat, jahr=jahr)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    return miniplan


def _dienst_typ(db_session, pfarrei: Pfarrei, gruppe: Gruppe) -> DienstTyp:
    from app.models.dienst_typ import DienstTypGruppenAnforderung

    dienst_typ = DienstTyp(
        pfarrei_id=pfarrei.id,
        name="Weihrauch",
        standard_anzahl=2,
        erforderliche_filtertags=["arbeiter"],
        gruppen_anforderungen=[
            DienstTypGruppenAnforderung(gruppe_id=gruppe.id, mindest_anzahl=1)
        ],
    )
    db_session.add(dienst_typ)
    db_session.commit()
    db_session.refresh(dienst_typ)
    return dienst_typ


def _mini(db_session, pfarrei: Pfarrei, gruppe: Gruppe, name: str = "Max Muster") -> Mini:
    mini = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name=name)
    db_session.add(mini)
    db_session.commit()
    db_session.refresh(mini)
    return mini


def test_gottesdienst_anlegen_mit_dienstbedarf_aus_dienst_typ(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    db_session,
    filtertags: dict,
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    dienst_typ = _dienst_typ(db_session, pfarrei, gruppe)
    mini = _mini(db_session, pfarrei, gruppe)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "notiz": "Bitte pünktlich da sein",
            "dienstbedarf": [
                {
                    "dienst_typ_id": dienst_typ.id,
                    "anzahl": 2,
                    "erforderliche_filtertags": ["arbeiter"],
                    "gruppen_anforderungen": [{"gruppe_id": gruppe.id, "mindest_anzahl": 1}],
                    "mini_ids": [mini.id],
                    "zeige_label": True,
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Sonntagsmesse"
    assert body["notiz"] == "Bitte pünktlich da sein"
    bedarf = body["dienstbedarf"][0]
    assert bedarf["dienst_typ"]["id"] == dienst_typ.id
    assert bedarf["dienst_typ"]["name"] == "Weihrauch"
    assert bedarf["anzahl"] == 2
    assert bedarf["erforderliche_filtertags"] == ["arbeiter"]
    assert bedarf["zeige_label"] is True
    assert [a["gruppe"]["id"] for a in bedarf["gruppen_anforderungen"]] == [gruppe.id]
    assert [m["id"] for m in bedarf["zugewiesene_minis"]] == [mini.id]


def test_gottesdienst_anlegen_mit_unbekanntem_filtertag_abgelehnt(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    db_session,
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [
                {"name": "Kreuz", "anzahl": 1, "erforderliche_filtertags": ["arbeiter"]}
            ],
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_gottesdienst_anlegen_mit_freiem_text_dienst(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = _miniplan(db_session, pfarrei)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "18:00:00",
            "name": "Vorabendmesse",
            "dienstbedarf": [
                {"name": "Alle Ministranten", "anzahl": 5, "erforderliche_filtertags": []}
            ],
        },
        headers=headers,
    )
    assert response.status_code == 201
    bedarf = response.json()["dienstbedarf"][0]
    assert bedarf["dienst_typ"] is None
    assert bedarf["name"] == "Alle Ministranten"


def test_dienstbedarf_erfordert_genau_eine_quelle(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [{"anzahl": 1, "erforderliche_filtertags": []}],
        },
        headers=headers,
    )
    assert response.status_code == 422
    # Die Fehlermeldung des model_validators muss unverändert als `msg` der
    # FastAPI-Validierungsfehler-Liste ankommen, damit das Frontend (client.ts)
    # daraus einen lesbaren Text zusammensetzen kann statt "[object Object]".
    fehler = response.json()["detail"]
    assert any(
        "Entweder dienst_typ_id oder name muss gesetzt sein" in eintrag["msg"]
        for eintrag in fehler
    )


def test_dienstbedarf_mindestanzahl_ueber_anzahl_abgelehnt(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    db_session,
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [
                {
                    "name": "Kreuz",
                    "anzahl": 1,
                    "erforderliche_filtertags": [],
                    "gruppen_anforderungen": [{"gruppe_id": gruppe.id, "mindest_anzahl": 2}],
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 422


def test_dienstbedarf_mit_fremdem_dienst_typ_abgelehnt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    fremder_dienst_typ = DienstTyp(
        pfarrei_id=andere_pfarrei.id, name="Fremd", standard_anzahl=1, erforderliche_filtertags=[]
    )
    db_session.add(fremder_dienst_typ)
    db_session.commit()
    db_session.refresh(fremder_dienst_typ)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [
                {"dienst_typ_id": fremder_dienst_typ.id, "anzahl": 1, "erforderliche_filtertags": []}
            ],
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_dienstbedarf_mit_fremdem_mini_abgelehnt(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    gruppe: Gruppe,
    db_session,
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    andere_gruppe = Gruppe(pfarrei_id=andere_pfarrei.id, name="Fremd")
    db_session.add(andere_gruppe)
    db_session.commit()
    db_session.refresh(andere_gruppe)
    fremder_mini = _mini(db_session, andere_pfarrei, andere_gruppe, "Fremder Mini")

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [
                {
                    "name": "Kreuz",
                    "anzahl": 1,
                    "erforderliche_filtertags": [],
                    "mini_ids": [fremder_mini.id],
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_gottesdienst_notiz_ist_optional_und_rundtrip_faehig(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    ohne_notiz = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={"datum": "2026-07-05", "uhrzeit": "10:00:00", "name": "Sonntagsmesse"},
        headers=headers,
    )
    assert ohne_notiz.status_code == 201
    assert ohne_notiz.json()["notiz"] is None

    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-06",
            "uhrzeit": "10:00:00",
            "name": "Werktagsmesse",
            "notiz": "Bitte den Ministrantenraum aufschließen",
        },
        headers=headers,
    ).json()
    assert erstellt["notiz"] == "Bitte den Ministrantenraum aufschließen"

    aktualisiert = client.put(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste/{erstellt['id']}",
        json={"datum": "2026-07-06", "uhrzeit": "10:00:00", "name": "Werktagsmesse"},
        headers=headers,
    )
    assert aktualisiert.status_code == 200
    assert aktualisiert.json()["notiz"] is None


def test_gottesdienst_bearbeiten_ersetzt_dienstbedarf(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [
                {"name": "Kreuz", "anzahl": 1, "erforderliche_filtertags": []}
            ],
        },
        headers=headers,
    ).json()

    response = client.put(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste/{erstellt['id']}",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "11:00:00",
            "name": "Sonntagsmesse (verschoben)",
            "dienstbedarf": [
                {"name": "Buch", "anzahl": 1, "erforderliche_filtertags": []}
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Sonntagsmesse (verschoben)"
    assert body["uhrzeit"] == "11:00:00"
    assert len(body["dienstbedarf"]) == 1
    assert body["dienstbedarf"][0]["name"] == "Buch"


def test_gottesdienst_loeschen_entfernt_dienstbedarf(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")

    erstellt = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste",
        json={
            "datum": "2026-07-05",
            "uhrzeit": "10:00:00",
            "name": "Sonntagsmesse",
            "dienstbedarf": [{"name": "Kreuz", "anzahl": 1, "erforderliche_filtertags": []}],
        },
        headers=headers,
    ).json()

    response = client.delete(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/gottesdienste/{erstellt['id']}",
        headers=headers,
    )
    assert response.status_code == 204

    detail = client.get(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}", headers=headers
    ).json()
    assert detail["gottesdienste"] == []
