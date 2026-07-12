from sqlalchemy.orm import Session

from app.models.dienst_typ import DienstTyp
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.gruppe import Gruppe
from app.models.pfarrei import Pfarrei
from app.services.stammdaten_seed import seed_default_stammdaten


def test_seed_default_stammdaten_legt_filtertags_mit_blockern_an(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    seed_default_stammdaten(db_session, pfarrei)

    filtertags = (
        db_session.query(Filtertag)
        .filter(Filtertag.pfarrei_id == pfarrei.id)
        .order_by(Filtertag.key)
        .all()
    )
    assert {(f.key, f.ist_schueler_artig) for f in filtertags} == {
        ("arbeiter", False),
        ("grundschueler", True),
        ("schueler", True),
    }

    grundschueler = next(f for f in filtertags if f.key == "grundschueler")
    blocker = (
        db_session.query(FiltertagBlocker)
        .filter(FiltertagBlocker.filtertag_id == grundschueler.id)
        .order_by(FiltertagBlocker.wochentag)
        .all()
    )
    assert [b.wochentag for b in blocker] == [0, 1, 2, 3, 4]
    assert all(b.start_zeit.strftime("%H:%M") == "08:00" for b in blocker)
    assert all(b.end_zeit.strftime("%H:%M") == "13:00" for b in blocker)


def test_seed_default_stammdaten_legt_gruppen_an(db_session: Session, pfarrei: Pfarrei) -> None:
    seed_default_stammdaten(db_session, pfarrei)

    gruppen_namen = {
        g.name for g in db_session.query(Gruppe).filter(Gruppe.pfarrei_id == pfarrei.id).all()
    }
    assert gruppen_namen == {"Neu", "Normal", "Obermini"}


def test_seed_default_stammdaten_legt_dienst_typen_an(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    seed_default_stammdaten(db_session, pfarrei)

    dienst_typen = {
        dt.name: dt
        for dt in db_session.query(DienstTyp).filter(DienstTyp.pfarrei_id == pfarrei.id).all()
    }
    assert set(dienst_typen) == {
        "Sonntagsmesse",
        "Weihrauch",
        "Wochentagsmesse",
        "Alle Ministranten",
    }

    sonntagsmesse = dienst_typen["Sonntagsmesse"]
    assert sonntagsmesse.standard_anzahl == 4
    assert sonntagsmesse.zeige_label is False
    assert [a.mindest_anzahl for a in sonntagsmesse.gruppen_anforderungen] == [1]
    assert sonntagsmesse.gruppen_anforderungen[0].gruppe.name == "Obermini"

    weihrauch = dienst_typen["Weihrauch"]
    assert weihrauch.standard_anzahl == 2
    assert weihrauch.zeige_label is True
    assert [a.mindest_anzahl for a in weihrauch.gruppen_anforderungen] == [1]

    wochentagsmesse = dienst_typen["Wochentagsmesse"]
    assert wochentagsmesse.standard_anzahl == 3
    assert wochentagsmesse.zeige_label is False
    assert wochentagsmesse.gruppen_anforderungen == []

    alle_ministranten = dienst_typen["Alle Ministranten"]
    assert alle_ministranten.standard_anzahl == 0
    assert alle_ministranten.zeige_label is True
    assert alle_ministranten.gruppen_anforderungen == []
