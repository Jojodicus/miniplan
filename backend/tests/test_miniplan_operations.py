"""Tests für `app.services.miniplan_operations` direkt gegen die Service-Funktionen (ohne HTTP-
Layer) - siehe `tests/test_miniplaene.py` für die Endpunkt-Tests (Rollen, Statuscodes, ...), die
dieselben Funktionen über die Router aufrufen."""

from datetime import date, time

import pytest

from app.models.dienstbedarf import (
    Dienstbedarf,
    DienstbedarfGruppenAnforderung,
    DienstbedarfZuweisung,
)
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.pfarrei import Pfarrei
from app.services import miniplan_operations


def _miniplan(db_session, pfarrei: Pfarrei, monat: int, jahr: int) -> Miniplan:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=monat, jahr=jahr)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    return miniplan


def test_fuellen_miniplan_besetzt_freie_stellen_und_laesst_fixierte_unangetastet(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    mini_fix = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Fix")
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="B")
    db_session.add_all([mini_fix, mini_a, mini_b])
    miniplan = _miniplan(db_session, pfarrei, 5, 2030)
    bedarf = Dienstbedarf(
        name="Kreuz",
        anzahl=3,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_fix.id, manuell_fixiert=True)],
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2030, 5, 5), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(miniplan)

    miniplan_operations.fuellen_miniplan(db_session, pfarrei.id, miniplan)
    db_session.refresh(miniplan)

    zuweisungen = miniplan.gottesdienste[0].dienstbedarf[0].zuweisungen
    assert len(zuweisungen) == 3
    fixierte = [z for z in zuweisungen if z.manuell_fixiert]
    assert len(fixierte) == 1
    assert fixierte[0].mini_id == mini_fix.id
    freie_minis = {z.mini_id for z in zuweisungen if not z.manuell_fixiert}
    assert freie_minis == {mini_a.id, mini_b.id}


def test_fuellen_miniplan_erneuter_lauf_uebersteht_gleiche_zuteilung(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    """Regressionstest: ein erneuter `fuellen_miniplan`-Lauf kann denselben Mini wieder demselben
    Dienstbedarf zuteilen (hier erzwungen über eine Gruppen-Mindestanzahl, die exakt die beiden
    einzigen Minis dieser Gruppe verlangt) - die alten, nicht fixierten Zuweisungen müssen dafür
    vor dem Einfügen der neuen tatsächlich gelöscht und geflusht werden, sonst verletzt die neue
    Zeile den Unique-Constraint (dienstbedarf_id, mini_id) der alten."""
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="B")
    db_session.add_all([mini_a, mini_b])
    miniplan = _miniplan(db_session, pfarrei, 8, 2030)
    bedarf = Dienstbedarf(
        name="Kreuz",
        anzahl=2,
        gruppen_anforderungen=[
            DienstbedarfGruppenAnforderung(gruppe_id=gruppe.id, mindest_anzahl=2)
        ],
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2030, 8, 4), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(miniplan)

    miniplan_operations.fuellen_miniplan(db_session, pfarrei.id, miniplan)
    db_session.refresh(miniplan)
    zuweisungen = miniplan.gottesdienste[0].dienstbedarf[0].zuweisungen
    assert len(zuweisungen) == 2
    ziel = zuweisungen[0]
    ziel.manuell_fixiert = True
    db_session.commit()

    miniplan_operations.fuellen_miniplan(db_session, pfarrei.id, miniplan)
    db_session.refresh(miniplan)
    zuweisungen_danach = miniplan.gottesdienste[0].dienstbedarf[0].zuweisungen
    assert len(zuweisungen_danach) == 2
    treffer = [z for z in zuweisungen_danach if z.mini_id == ziel.mini_id]
    assert len(treffer) == 1
    assert treffer[0].manuell_fixiert is True


def test_zuweisungen_tauschen_vertauscht_minis_und_behaelt_fixierung_an_der_stelle(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="B")
    db_session.add_all([mini_a, mini_b])
    miniplan = _miniplan(db_session, pfarrei, 6, 2030)
    bedarf_a = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_a.id, manuell_fixiert=True)],
    )
    gottesdienst_a = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 6, 1),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_a],
    )
    bedarf_b = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id, manuell_fixiert=False)],
    )
    gottesdienst_b = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 6, 8),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_b],
    )
    db_session.add_all([gottesdienst_a, gottesdienst_b])
    db_session.commit()
    db_session.refresh(miniplan)

    zuweisung_a = bedarf_a.zuweisungen[0]
    zuweisung_b = bedarf_b.zuweisungen[0]

    miniplan_operations.zuweisungen_tauschen(db_session, zuweisung_a, zuweisung_b)
    db_session.refresh(miniplan)

    gottesdienste_nach_datum = sorted(miniplan.gottesdienste, key=lambda g: g.datum)
    neue_zuweisung_a = gottesdienste_nach_datum[0].dienstbedarf[0].zuweisungen[0]
    neue_zuweisung_b = gottesdienste_nach_datum[1].dienstbedarf[0].zuweisungen[0]
    # Die Minis sind getauscht ...
    assert neue_zuweisung_a.mini_id == mini_b.id
    assert neue_zuweisung_b.mini_id == mini_a.id
    # ... aber die Fixierung ist an der Stelle (Zeile) hängen geblieben, nicht dem Mini gefolgt.
    assert neue_zuweisung_a.manuell_fixiert is True
    assert neue_zuweisung_b.manuell_fixiert is False


def test_zuweisungen_tauschen_wirft_bei_doppelbelegung_im_ziel_gottesdienst(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="B")
    db_session.add_all([mini_a, mini_b])
    miniplan = _miniplan(db_session, pfarrei, 7, 2030)
    bedarf_1 = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_a.id, manuell_fixiert=True)],
    )
    # mini_b ist im selben Gottesdienst wie bedarf_1 bereits über einen zweiten Dienstbedarf
    # eingeteilt - ein Tausch, der mini_b nach bedarf_1 brächte, wäre eine Doppelbelegung.
    bedarf_2 = Dienstbedarf(
        name="Weihrauch",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id, manuell_fixiert=True)],
    )
    gottesdienst_1 = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 7, 1),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_1, bedarf_2],
    )
    bedarf_3 = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id, manuell_fixiert=False)],
    )
    gottesdienst_2 = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 7, 8),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_3],
    )
    db_session.add_all([gottesdienst_1, gottesdienst_2])
    db_session.commit()

    zuweisung_a = bedarf_1.zuweisungen[0]
    zuweisung_c = bedarf_3.zuweisungen[0]

    with pytest.raises(miniplan_operations.MiniBereitsEingeteiltFehler):
        miniplan_operations.zuweisungen_tauschen(db_session, zuweisung_a, zuweisung_c)


def test_zuweisungen_leeren_ohne_einschraenkung_entfernt_nur_automatische(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    mini_auto = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Auto")
    mini_fix = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Fix")
    db_session.add_all([mini_auto, mini_fix])
    miniplan = _miniplan(db_session, pfarrei, 9, 2030)
    bedarf = Dienstbedarf(
        name="Kreuz",
        anzahl=2,
        zuweisungen=[
            DienstbedarfZuweisung(mini_id=mini_auto.id, manuell_fixiert=False),
            DienstbedarfZuweisung(mini_id=mini_fix.id, manuell_fixiert=True),
        ],
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2030, 9, 1), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(miniplan)

    miniplan_operations.zuweisungen_leeren(db_session, miniplan, None, None)
    db_session.refresh(miniplan)

    zuweisungen = miniplan.gottesdienste[0].dienstbedarf[0].zuweisungen
    assert len(zuweisungen) == 1
    assert zuweisungen[0].mini_id == mini_fix.id
    assert zuweisungen[0].manuell_fixiert is True


def test_zuweisungen_leeren_gezielt_nur_fuer_gottesdienst(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="B")
    db_session.add_all([mini_a, mini_b])
    miniplan = _miniplan(db_session, pfarrei, 10, 2030)
    bedarf_1 = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_a.id, manuell_fixiert=False)],
    )
    gottesdienst_1 = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 10, 5),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_1],
    )
    bedarf_2 = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id, manuell_fixiert=False)],
    )
    gottesdienst_2 = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 10, 12),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_2],
    )
    db_session.add_all([gottesdienst_1, gottesdienst_2])
    db_session.commit()
    db_session.refresh(miniplan)

    miniplan_operations.zuweisungen_leeren(db_session, miniplan, gottesdienst_1.id, None)
    db_session.refresh(miniplan)

    gottesdienste_by_id = {g.id: g for g in miniplan.gottesdienste}
    assert gottesdienste_by_id[gottesdienst_1.id].dienstbedarf[0].zuweisungen == []
    assert len(gottesdienste_by_id[gottesdienst_2.id].dienstbedarf[0].zuweisungen) == 1


def test_zuweisungen_leeren_gezielt_nur_fuer_dienstbedarf(
    db_session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    mini_a = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="A")
    mini_b = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="B")
    db_session.add_all([mini_a, mini_b])
    miniplan = _miniplan(db_session, pfarrei, 11, 2030)
    bedarf_1 = Dienstbedarf(
        name="Kreuz",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_a.id, manuell_fixiert=False)],
    )
    bedarf_2 = Dienstbedarf(
        name="Weihrauch",
        anzahl=1,
        zuweisungen=[DienstbedarfZuweisung(mini_id=mini_b.id, manuell_fixiert=False)],
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id,
        datum=date(2030, 11, 3),
        uhrzeit=time(10, 0),
        dienstbedarf=[bedarf_1, bedarf_2],
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(miniplan)

    miniplan_operations.zuweisungen_leeren(db_session, miniplan, None, bedarf_1.id)
    db_session.refresh(miniplan)

    bedarf_by_name = {b.name: b for b in miniplan.gottesdienste[0].dienstbedarf}
    assert bedarf_by_name["Kreuz"].zuweisungen == []
    assert len(bedarf_by_name["Weihrauch"].zuweisungen) == 1
