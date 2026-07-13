from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app.api import miniplaene as miniplaene_api
from app.models.dienstbedarf import (
    Dienstbedarf,
    DienstbedarfGruppenAnforderung,
    DienstbedarfZuweisung,
)
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
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
    response = client.post(f"/api/pfarreien/{pfarrei.id}/miniplaene", json=daten, headers=headers)
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
    response = client.get(f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}", headers=headers)
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
    client: TestClient,
    verantwortlicher_user: Nutzer,
    betrachter_user: Nutzer,
    pfarrei: Pfarrei,
    db_session,
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
    response = client.get(f"/api/pfarreien/{pfarrei.id}/miniplaene/999/pdf", headers=headers)
    assert response.status_code == 404


def test_miniplan_fuellen_besetzt_freie_stellen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    minis = [Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name=f"Mini {i}") for i in range(2)]
    db_session.add_all(minis)
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=5, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    bedarf = Dienstbedarf(name="Kreuz", anzahl=2)
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2027, 5, 2), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/fuellen", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    zuweisungen = body["gottesdienste"][0]["dienstbedarf"][0]["zuweisungen"]
    assert len(zuweisungen) == 2
    assert {z["mini"]["name"] for z in zuweisungen} == {"Mini 0", "Mini 1"}
    assert {z["manuell_fixiert"] for z in zuweisungen} == {False}


def test_miniplan_fuellen_synchronisiert_ferien_fuer_planjahr(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=8, jahr=2028)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    aufrufe: list[set[int]] = []

    def fake_sync_ferien(pfarrei_arg, db, jahre=None):
        aufrufe.append(jahre)
        return []

    monkeypatch.setattr(miniplaene_api, "sync_ferien_falls_fehlend", fake_sync_ferien)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/fuellen", headers=headers
    )
    assert response.status_code == 200
    assert aufrufe == [{2028, 2029}]


def test_miniplan_fuellen_ignoriert_ferien_sync_fehler(
    client: TestClient,
    verantwortlicher_user: Nutzer,
    pfarrei: Pfarrei,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=9, jahr=2028)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    def failing_sync_ferien(pfarrei_arg, db, jahre=None):
        raise miniplaene_api.FerienSyncFehler("keine Verbindung")

    monkeypatch.setattr(miniplaene_api, "sync_ferien_falls_fehlend", failing_sync_ferien)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/fuellen", headers=headers
    )
    assert response.status_code == 200


def test_miniplan_fuellen_erfordert_verantwortlich(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=6, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/fuellen", headers=headers
    )
    assert response.status_code == 403


def _plan_mit_zwei_gottesdiensten(db_session, pfarrei: Pfarrei, gruppe: Gruppe):
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Mini A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Mini B")
    db_session.add_all([mini_a, mini_b])
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    bedarf_1 = Dienstbedarf(
        name="Kreuz", anzahl=1, zuweisungen=[DienstbedarfZuweisung(mini_id=mini_a.id)]
    )
    gottesdienst_1 = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2027, 7, 4),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_1],
    )
    bedarf_2 = Dienstbedarf(
        name="Kreuz", anzahl=1, zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id)]
    )
    gottesdienst_2 = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2027, 7, 11),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_2],
    )
    db_session.add_all([gottesdienst_1, gottesdienst_2])
    db_session.commit()
    db_session.refresh(miniplan)

    zuweisung_a = bedarf_1.zuweisungen[0]
    zuweisung_b = bedarf_2.zuweisungen[0]
    return miniplan, zuweisung_a, zuweisung_b, mini_a, mini_b


def test_zuweisungen_tauschen_ueber_zwei_gottesdienste(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, zuweisung_a, zuweisung_b, mini_a, mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/tauschen",
        json={"zuweisung_id_a": zuweisung_a.id, "zuweisung_id_b": zuweisung_b.id},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    gottesdienste_nach_datum = sorted(body["gottesdienste"], key=lambda g: g["datum"])
    assert (
        gottesdienste_nach_datum[0]["dienstbedarf"][0]["zuweisungen"][0]["mini"]["id"] == mini_b.id
    )
    assert (
        gottesdienste_nach_datum[1]["dienstbedarf"][0]["zuweisungen"][0]["mini"]["id"] == mini_a.id
    )


def test_zuweisungen_tauschen_innerhalb_desselben_gottesdienstes(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Mini A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Mini B")
    db_session.add_all([mini_a, mini_b])
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    bedarf_1 = Dienstbedarf(
        name="Kreuz", anzahl=1, zuweisungen=[DienstbedarfZuweisung(mini_id=mini_a.id)]
    )
    bedarf_2 = Dienstbedarf(
        name="Weihrauch", anzahl=1, zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id)]
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2027, 7, 4),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_1, bedarf_2],
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(miniplan)
    zuweisung_a = bedarf_1.zuweisungen[0]
    zuweisung_b = bedarf_2.zuweisungen[0]

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/tauschen",
        json={"zuweisung_id_a": zuweisung_a.id, "zuweisung_id_b": zuweisung_b.id},
        headers=headers,
    )
    assert response.status_code == 200
    bedarf_nach_name = {b["name"]: b for b in response.json()["gottesdienste"][0]["dienstbedarf"]}
    assert bedarf_nach_name["Kreuz"]["zuweisungen"][0]["mini"]["id"] == mini_b.id
    assert bedarf_nach_name["Weihrauch"]["zuweisungen"][0]["mini"]["id"] == mini_a.id


def test_zuweisungen_tauschen_lehnt_duplikat_im_ziel_gottesdienst_ab(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, zuweisung_a, zuweisung_b, mini_a, mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )
    # Zweiter Dienstbedarf im selben Gottesdienst wie zuweisung_a, mit mini_b schon eingeteilt -
    # nach dem Tausch wäre mini_b doppelt in diesem Gottesdienst.
    weiterer_bedarf = Dienstbedarf(
        gottesdienst_id=zuweisung_a.dienstbedarf.gottesdienst_id,
        name="Weihrauch",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id)],
    )
    db_session.add(weiterer_bedarf)
    db_session.commit()

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/tauschen",
        json={"zuweisung_id_a": zuweisung_a.id, "zuweisung_id_b": zuweisung_b.id},
        headers=headers,
    )
    assert response.status_code == 409


def test_zuweisungen_tauschen_erfordert_verantwortlich(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, zuweisung_a, zuweisung_b, _mini_a, _mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/tauschen",
        json={"zuweisung_id_a": zuweisung_a.id, "zuweisung_id_b": zuweisung_b.id},
        headers=headers,
    )
    assert response.status_code == 403


def test_zuweisung_fixierung_setzen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, zuweisung_a, _zuweisung_b, _mini_a, _mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )
    assert zuweisung_a.manuell_fixiert is True

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/{zuweisung_a.id}/fixierung",
        json={"manuell_fixiert": False},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    zuweisung = body["gottesdienste"][0]["dienstbedarf"][0]["zuweisungen"][0]
    assert zuweisung["manuell_fixiert"] is False


def test_zuweisung_fixierung_erfordert_verantwortlich(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, zuweisung_a, _zuweisung_b, _mini_a, _mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/{zuweisung_a.id}/fixierung",
        json={"manuell_fixiert": False},
        headers=headers,
    )
    assert response.status_code == 403


def test_zuweisung_unbekannt_liefert_404(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, zuweisung_a, _zuweisung_b, _mini_a, _mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/tauschen",
        json={"zuweisung_id_a": zuweisung_a.id, "zuweisung_id_b": 999},
        headers=headers,
    )
    assert response.status_code == 404


def test_miniplan_fixierung_uebersteht_erneutes_fuellen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    # Regressionstest: ein erneuter Füllen-Lauf kann denselben Mini wieder demselben Dienstbedarf
    # zuteilen (z.B. weil er der einzige verbleibende Kandidat ist) - der Endpoint muss die nicht
    # fixierten Zuweisungen vor dem Einfügen der neuen tatsächlich löschen und flushen, sonst
    # verletzt die neue Zeile den Unique-Constraint (dienstbedarf_id, mini_id) der alten.
    minis = [Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name=f"Mini {i}") for i in range(2)]
    db_session.add_all(minis)
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=8, jahr=2028)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    bedarf = Dienstbedarf(
        name="Kreuz",
        anzahl=2,
        gruppen_anforderungen=[
            DienstbedarfGruppenAnforderung(gruppe_id=gruppe.id, mindest_anzahl=2)
        ],
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2028, 8, 6), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/fuellen", headers=headers
    )
    assert response.status_code == 200
    zuweisungen = response.json()["gottesdienste"][0]["dienstbedarf"][0]["zuweisungen"]
    assert len(zuweisungen) == 2
    ziel = zuweisungen[0]

    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/{ziel['id']}/fixierung",
        json={"manuell_fixiert": True},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/fuellen", headers=headers
    )
    assert response.status_code == 200
    zuweisungen_danach = response.json()["gottesdienste"][0]["dienstbedarf"][0]["zuweisungen"]
    assert len(zuweisungen_danach) == 2
    treffer = [z for z in zuweisungen_danach if z["mini"]["id"] == ziel["mini"]["id"]]
    assert len(treffer) == 1
    assert treffer[0]["manuell_fixiert"] is True


def _plan_mit_auto_und_fixierter_zuweisung(db_session, pfarrei: Pfarrei, gruppe: Gruppe):
    # Ein Dienstbedarf (anzahl 2) mit einer automatischen (nicht fixierten) und einer manuell
    # fixierten Zuweisung, um das gezielte Leeren nur der automatischen zu prüfen.
    mini_auto = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Auto Mini")
    mini_fix = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Fix Mini")
    db_session.add_all([mini_auto, mini_fix])
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=9, jahr=2029)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    bedarf = Dienstbedarf(
        name="Kreuz",
        anzahl=2,
        zuweisungen=[
            DienstbedarfZuweisung(mini_id=mini_auto.id, manuell_fixiert=False),
            DienstbedarfZuweisung(mini_id=mini_fix.id, manuell_fixiert=True),
        ],
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2029, 9, 2), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(miniplan)
    return miniplan, mini_auto, mini_fix


def test_zuweisungen_leeren_entfernt_nur_automatische(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, _mini_auto, mini_fix = _plan_mit_auto_und_fixierter_zuweisung(
        db_session, pfarrei, gruppe
    )

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/leeren",
        json={},
        headers=headers,
    )
    assert response.status_code == 200
    zuweisungen = response.json()["gottesdienste"][0]["dienstbedarf"][0]["zuweisungen"]
    assert len(zuweisungen) == 1
    assert zuweisungen[0]["mini"]["id"] == mini_fix.id
    assert zuweisungen[0]["manuell_fixiert"] is True


def test_zuweisungen_leeren_nur_fuer_gottesdienst(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    # Nur automatische Zuweisungen im angegebenen Gottesdienst werden geleert; ein anderer
    # Gottesdienst bleibt unberührt.
    miniplan, zuweisung_a, _zuweisung_b, _mini_a, _mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )
    # Beide Zuweisungen aus dem Helper sind fixiert (Default True) - eine auf automatisch stellen.
    zuweisung_a.manuell_fixiert = False
    db_session.commit()
    gottesdienst_a_id = zuweisung_a.dienstbedarf.gottesdienst_id

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/leeren",
        json={"gottesdienst_id": gottesdienst_a_id},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    gottesdienste = {g["id"]: g for g in body["gottesdienste"]}
    assert gottesdienste[gottesdienst_a_id]["dienstbedarf"][0]["zuweisungen"] == []
    andere = [g for gid, g in gottesdienste.items() if gid != gottesdienst_a_id][0]
    assert len(andere["dienstbedarf"][0]["zuweisungen"]) == 1


def test_zuweisungen_leeren_erfordert_verantwortlich(
    client: TestClient, betrachter_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    miniplan, _mini_auto, _mini_fix = _plan_mit_auto_und_fixierter_zuweisung(
        db_session, pfarrei, gruppe
    )

    headers = auth_headers(client, "betrachter@example.com", "geheim123")
    response = client.post(
        f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}/zuweisungen/leeren",
        json={},
        headers=headers,
    )
    assert response.status_code == 403


def test_zuteilung_einstellungen_defaults_und_setzen(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, db_session
) -> None:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=12, jahr=2027)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    base = f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}"

    # Defaults reproduzieren das Alt-Verhalten.
    response = client.get(base, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["fairness_gewicht"] == 1.0
    assert body["mindestabstand_tage"] == 6
    assert body["mixing_gewicht"] == 0.0
    assert body["wiederholung_gewicht"] == 0.0

    response = client.put(
        f"{base}/zuteilung-einstellungen",
        json={
            "fairness_gewicht": 2.5,
            "mindestabstand_tage": 10,
            "mixing_gewicht": 4.0,
            "wiederholung_gewicht": 1.5,
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fairness_gewicht"] == 2.5
    assert body["mindestabstand_tage"] == 10
    assert body["mixing_gewicht"] == 4.0
    assert body["wiederholung_gewicht"] == 1.5

    # Ungültige Werte werden abgelehnt.
    response = client.put(
        f"{base}/zuteilung-einstellungen",
        json={
            "fairness_gewicht": -1,
            "mindestabstand_tage": 10,
            "mixing_gewicht": 4.0,
            "wiederholung_gewicht": 1.5,
        },
        headers=headers,
    )
    assert response.status_code == 422


def test_abgeschlossener_miniplan_ist_schreibgeschuetzt(
    client: TestClient, verantwortlicher_user: Nutzer, pfarrei: Pfarrei, gruppe: Gruppe, db_session
) -> None:
    """Ein abgeschlossener Miniplan lehnt jede Mutation mit 409 ab; erst nach Wieder-öffnen sind
    Änderungen wieder erlaubt."""
    miniplan, zuweisung_a, _zuweisung_b, _mini_a, _mini_b = _plan_mit_zwei_gottesdiensten(
        db_session, pfarrei, gruppe
    )
    gottesdienst_id = zuweisung_a.dienstbedarf.gottesdienst_id
    zuweisung_a_id = zuweisung_a.id
    miniplan.status = "abgeschlossen"
    db_session.commit()

    headers = auth_headers(client, "verantwortlich@example.com", "geheim123")
    base = f"/api/pfarreien/{pfarrei.id}/miniplaene/{miniplan.id}"

    mutationen = [
        ("put", base, {"veranstaltungen": "x", "ankuendigungen": None}),
        ("post", f"{base}/fuellen", None),
        ("post", f"{base}/zuweisungen/leeren", {}),
        (
            "post",
            f"{base}/zuweisungen/{zuweisung_a_id}/fixierung",
            {"manuell_fixiert": False},
        ),
        ("delete", base, None),
        (
            "post",
            f"{base}/gottesdienste",
            {"datum": "2027-07-18", "uhrzeit": "10:00", "name": None, "dienstbedarf": []},
        ),
        ("delete", f"{base}/gottesdienste/{gottesdienst_id}", None),
    ]
    for methode, url, body in mutationen:
        response = client.request(methode.upper(), url, json=body, headers=headers)
        assert response.status_code == 409, f"{methode.upper()} {url} -> {response.status_code}"

    # Wieder öffnen macht den Plan editierbar.
    response = client.post(f"{base}/status", json={"status": "in_bearbeitung"}, headers=headers)
    assert response.status_code == 200
    response = client.put(
        base, json={"veranstaltungen": "x", "ankuendigungen": None}, headers=headers
    )
    assert response.status_code == 200
