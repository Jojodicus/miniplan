from sqlalchemy.orm import Session

from app.models.dienstbedarf import Dienstbedarf, DienstbedarfGruppenAnforderung
from app.models.filtertag import Filtertag
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.pfarrei import Pfarrei
from app.services.demo_seed import seed_demo_daten
from app.services.stammdaten_seed import seed_default_stammdaten


def test_seed_demo_daten_erzeugt_konsistenten_bestand(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    # seed_demo_daten setzt voraus, dass die Pfarrei bereits Gruppen/Filtertags/DienstTypen hat
    # (siehe Docstring in demo_seed.py) - genau wie app.cli.create_pfarrei es tut.
    seed_default_stammdaten(db_session, pfarrei)
    seed_demo_daten(db_session, pfarrei)

    gruppen_ids = {g.id for g in db_session.query(Gruppe).filter(Gruppe.pfarrei_id == pfarrei.id)}
    filtertag_keys = {
        f.key for f in db_session.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei.id)
    }

    minis = db_session.query(Mini).filter(Mini.pfarrei_id == pfarrei.id).all()
    assert len(minis) == 15
    for mini in minis:
        assert mini.pfarrei_id == pfarrei.id
        # jeder Mini referenziert eine Gruppe, die tatsächlich zu derselben Pfarrei gehört
        assert mini.gruppe_id in gruppen_ids
        # jeder Filtertag-Key eines Minis ist ein gültiger Key seiner eigenen Pfarrei
        assert set(mini.filtertags) <= filtertag_keys
        # jeder Mini hat mindestens einen Filtertag (Default-Datensatz enthält keine leeren)
        assert mini.filtertags

    miniplaene = db_session.query(Miniplan).filter(Miniplan.pfarrei_id == pfarrei.id).all()
    assert len(miniplaene) == 1
    miniplan = miniplaene[0]
    assert (miniplan.monat, miniplan.jahr) == (7, 2026)

    gottesdienste = (
        db_session.query(Gottesdienst).filter(Gottesdienst.miniplan_id == miniplan.id).all()
    )
    assert len(gottesdienste) == 5
    for gottesdienst in gottesdienste:
        assert gottesdienst.miniplan_id == miniplan.id

    gottesdienst_ids = {g.id for g in gottesdienste}
    dienstbedarfe = (
        db_session.query(Dienstbedarf)
        .filter(Dienstbedarf.gottesdienst_id.in_(gottesdienst_ids))
        .all()
    )
    # ein Dienstbedarf pro Gottesdienst im Demo-Datensatz
    assert len(dienstbedarfe) == 5
    for bedarf in dienstbedarfe:
        assert bedarf.gottesdienst_id in gottesdienst_ids
        assert bedarf.anzahl > 0
        # von einem DienstTyp abgeleitet, dessen Anzahl/Label 1:1 übernommen wurde
        assert bedarf.dienst_typ_id is not None
        # keine Zuweisungen im Demo-Datensatz - "Füllen" bleibt dem Nutzer überlassen
        assert bedarf.zuweisungen == []

    dienstbedarf_ids = {b.id for b in dienstbedarfe}
    anforderungen = (
        db_session.query(DienstbedarfGruppenAnforderung)
        .filter(DienstbedarfGruppenAnforderung.dienstbedarf_id.in_(dienstbedarf_ids))
        .all()
    )
    for anforderung in anforderungen:
        assert anforderung.dienstbedarf_id in dienstbedarf_ids
        assert anforderung.gruppe_id in gruppen_ids
        # der Weihrauch-Dienst (Obermini-Anforderung) sollte hier auftauchen
    assert len(anforderungen) >= 1


def test_seed_demo_daten_ist_deterministisch(db_session: Session, pfarrei: Pfarrei) -> None:
    seed_default_stammdaten(db_session, pfarrei)
    seed_demo_daten(db_session, pfarrei)

    mini_namen_erster_lauf = sorted(
        m.name for m in db_session.query(Mini).filter(Mini.pfarrei_id == pfarrei.id)
    )

    andere_pfarrei = Pfarrei(name="Zweite Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)
    seed_default_stammdaten(db_session, andere_pfarrei)
    seed_demo_daten(db_session, andere_pfarrei)

    mini_namen_zweiter_lauf = sorted(
        m.name for m in db_session.query(Mini).filter(Mini.pfarrei_id == andere_pfarrei.id)
    )

    assert mini_namen_erster_lauf == mini_namen_zweiter_lauf
