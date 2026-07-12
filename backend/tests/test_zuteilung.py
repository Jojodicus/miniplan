from datetime import date, time, timedelta

from app.models.dienstbedarf import Dienstbedarf, DienstbedarfGruppenAnforderung, DienstbedarfZuweisung
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.pfarrei import Pfarrei
from app.services.zuteilung import zuteilung_vorschlagen


def _mini(db_session, pfarrei: Pfarrei, gruppe: Gruppe, name: str, filtertags: list[str] | None = None) -> Mini:
    mini = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name=name, filtertags=filtertags or [])
    db_session.add(mini)
    db_session.commit()
    db_session.refresh(mini)
    return mini


def _gottesdienst(
    db_session, miniplan: Miniplan, dienstbedarf: list[Dienstbedarf], datum: date, uhrzeit: time = time(10, 0)
) -> Gottesdienst:
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=datum, uhrzeit=uhrzeit, dienstbedarf=dienstbedarf
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(gottesdienst)
    return gottesdienst


def _miniplan(db_session, pfarrei: Pfarrei) -> Miniplan:
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2026)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    return miniplan


def test_zuteilung_besetzt_freie_stellen_wenn_genug_minis_vorhanden(db_session, pfarrei, gruppe) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    minis = [_mini(db_session, pfarrei, gruppe, f"Mini {i}") for i in range(3)]
    bedarf = Dienstbedarf(name="Kreuz", anzahl=2)
    _gottesdienst(db_session, miniplan, [bedarf], date(2026, 7, 5))
    db_session.refresh(miniplan)

    vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=1)

    zugeteilt = vorschlag[bedarf.id]
    assert len(zugeteilt) == 2
    assert set(zugeteilt) <= {m.id for m in minis}
    assert len(set(zugeteilt)) == 2  # kein Mini doppelt in derselben Stelle


def test_zuteilung_lässt_manuell_fixierte_zuweisungen_unangetastet(db_session, pfarrei, gruppe) -> None:
    miniplan = _miniplan(db_session, pfarrei)
    fixiert = _mini(db_session, pfarrei, gruppe, "Fixiert")
    frei = _mini(db_session, pfarrei, gruppe, "Frei")
    bedarf = Dienstbedarf(
        name="Kreuz",
        anzahl=2,
        zuweisungen=[DienstbedarfZuweisung(mini_id=fixiert.id, manuell_fixiert=True)],
    )
    _gottesdienst(db_session, miniplan, [bedarf], date(2026, 7, 5))
    db_session.refresh(miniplan)

    vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=1)

    # Der Algorithmus liefert nur die neu zugeteilte (nicht fixierte) Stelle zurück.
    assert vorschlag[bedarf.id] == [frei.id]


def test_zuteilung_verletzt_gruppen_mindestanzahl_nie(db_session, pfarrei) -> None:
    obermini = Gruppe(pfarrei_id=pfarrei.id, name="Obermini")
    normal = Gruppe(pfarrei_id=pfarrei.id, name="normal")
    db_session.add_all([obermini, normal])
    db_session.commit()
    db_session.refresh(obermini)
    db_session.refresh(normal)

    ober_mini = _mini(db_session, pfarrei, obermini, "Ober")
    normale_minis = [_mini(db_session, pfarrei, normal, f"Normal {i}") for i in range(3)]

    miniplan = _miniplan(db_session, pfarrei)
    bedarf = Dienstbedarf(
        name="Weihrauch",
        anzahl=2,
        gruppen_anforderungen=[
            DienstbedarfGruppenAnforderung(gruppe_id=obermini.id, mindest_anzahl=1)
        ],
    )
    _gottesdienst(db_session, miniplan, [bedarf], date(2026, 7, 5))
    db_session.refresh(miniplan)

    vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=7)

    zugeteilt = vorschlag[bedarf.id]
    assert len(zugeteilt) == 2
    assert ober_mini.id in zugeteilt


def test_zuteilung_ignoriert_erforderliche_filtertags_verletzung_nie(db_session, pfarrei, gruppe, filtertags) -> None:
    passend = _mini(db_session, pfarrei, gruppe, "Schueler", filtertags=["schueler"])
    unpassend = _mini(db_session, pfarrei, gruppe, "Grundschueler", filtertags=["grundschueler"])

    miniplan = _miniplan(db_session, pfarrei)
    bedarf = Dienstbedarf(name="Buch", anzahl=1, erforderliche_filtertags=["schueler"])
    _gottesdienst(db_session, miniplan, [bedarf], date(2026, 7, 5))
    db_session.refresh(miniplan)

    vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=3)

    assert vorschlag[bedarf.id] == [passend.id]
    assert unpassend.id not in vorschlag[bedarf.id]


def test_zuteilung_besetzt_stelle_nicht_mit_blockiertem_mini(db_session, pfarrei, gruppe, filtertags) -> None:
    # "arbeiter"-Blocker: Montag 8-17 Uhr blockiert - der Gottesdienst liegt in diesem Fenster.
    db_session.add(
        FiltertagBlocker(
            pfarrei_id=pfarrei.id,
            filtertag_id=filtertags["arbeiter"].id,
            wochentag=0,
            start_zeit=time(8, 0),
            end_zeit=time(17, 0),
        )
    )
    db_session.commit()

    blockiert = _mini(db_session, pfarrei, gruppe, "Blockiert", filtertags=["arbeiter"])

    miniplan = _miniplan(db_session, pfarrei)
    bedarf = Dienstbedarf(name="Kreuz", anzahl=1)
    # Montag, 10 Uhr.
    _gottesdienst(db_session, miniplan, [bedarf], date(2026, 7, 6), time(10, 0))
    db_session.refresh(miniplan)

    vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=4)

    assert vorschlag.get(bedarf.id, []) == []
    assert blockiert.id not in vorschlag.get(bedarf.id, [])


def test_zuteilung_verteilt_diensthaeufigkeit_fair(db_session, pfarrei, gruppe) -> None:
    minis = [_mini(db_session, pfarrei, gruppe, f"Mini {i}") for i in range(4)]
    miniplan = _miniplan(db_session, pfarrei)
    # 8 Sonntage im Wochenabstand (kein Abstands-Konflikt) mit je 1 Stelle -> bei 4 Minis exakt
    # 2 Dienste je Mini in einer perfekt fairen Zuteilung.
    for woche in range(8):
        bedarf = Dienstbedarf(name="Kreuz", anzahl=1)
        _gottesdienst(db_session, miniplan, [bedarf], date(2026, 1, 4) + timedelta(days=7 * woche))
    db_session.refresh(miniplan)

    vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=42)

    einsatz_anzahl: dict[int, int] = {m.id: 0 for m in minis}
    for zugeteilte_minis in vorschlag.values():
        for mini_id in zugeteilte_minis:
            einsatz_anzahl[mini_id] += 1

    assert sum(einsatz_anzahl.values()) == 8
    assert max(einsatz_anzahl.values()) - min(einsatz_anzahl.values()) <= 1


def _paar_wiederholungen(vorschlag: dict[int, list[int]], bedarf_ids_je_gottesdienst: list[list[int]]) -> int:
    """Zählt, wie oft dasselbe Mini-Paar über verschiedene Gottesdienste hinweg gemeinsam
    eingeteilt ist (Summe über Paare von max(0, Auftreten-1))."""
    paare: dict[tuple[int, int], int] = {}
    for bedarf_ids in bedarf_ids_je_gottesdienst:
        minis = sorted({m for bid in bedarf_ids for m in vorschlag.get(bid, [])})
        for i, a in enumerate(minis):
            for b in minis[i + 1 :]:
                paare[(a, b)] = paare.get((a, b), 0) + 1
    return sum(n - 1 for n in paare.values() if n > 1)


def test_zuteilung_mixing_reduziert_wiederholte_paare(db_session, pfarrei, gruppe) -> None:
    # 4 Minis, 4 Gottesdienste (wöchentlich, kein Abstands-Konflikt) mit je einem Bedarf für 2
    # Minis. Bei aktivem Mixing sollen sich Mini-Paare nicht wiederholen (4 verschiedene Paare
    # sind möglich, z.B. AB/CD/AC/BD).
    minis = [_mini(db_session, pfarrei, gruppe, f"Mini {i}") for i in range(4)]
    assert len(minis) == 4

    def _plan_mit_mixing(mixing_gewicht: float) -> int:
        miniplan = Miniplan(
            pfarrei_id=pfarrei.id, monat=3, jahr=2026, mixing_gewicht=mixing_gewicht
        )
        db_session.add(miniplan)
        db_session.commit()
        db_session.refresh(miniplan)
        bedarf_ids: list[list[int]] = []
        for woche in range(4):
            bedarf = Dienstbedarf(name="Kreuz", anzahl=2)
            _gottesdienst(db_session, miniplan, [bedarf], date(2026, 3, 1) + timedelta(days=7 * woche))
            bedarf_ids.append([bedarf.id])
        db_session.refresh(miniplan)
        vorschlag = zuteilung_vorschlagen(db_session, pfarrei.id, miniplan, zufallsstart=42)
        wiederholungen = _paar_wiederholungen(vorschlag, bedarf_ids)
        db_session.delete(miniplan)
        db_session.commit()
        return wiederholungen

    mit_mixing = _plan_mit_mixing(8.0)

    # Mit starkem Mixing-Gewicht findet die Zuteilung eine Lösung ganz ohne wiederholte Paare.
    assert mit_mixing == 0
