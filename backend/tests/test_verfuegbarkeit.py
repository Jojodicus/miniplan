from datetime import date, time

from sqlalchemy.orm import Session

from app.models.ferienzeitraum import Ferienzeitraum
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.pfarrei import Pfarrei
from app.models.feiertag_einstellung import FeiertagEinstellung
from app.services.verfuegbarkeit import ist_blockiert


def _blocker(
    db_session: Session, pfarrei: Pfarrei, filtertag: Filtertag, wochentag: int = 0
) -> None:
    db_session.add(
        FiltertagBlocker(
            pfarrei_id=pfarrei.id,
            filtertag=filtertag,
            wochentag=wochentag,
            start_zeit=time(8, 0),
            end_zeit=time(13, 0),
        )
    )
    db_session.commit()


def test_ausserhalb_des_blocker_fensters_nicht_blockiert(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    _blocker(db_session, pfarrei, Filtertag.ARBEITER)
    montag = date(2026, 7, 6)
    assert (
        ist_blockiert(db_session, pfarrei.id, Filtertag.ARBEITER, montag, time(14, 0)) is False
    )


def test_innerhalb_des_blocker_fensters_blockiert(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    _blocker(db_session, pfarrei, Filtertag.ARBEITER)
    montag = date(2026, 7, 6)
    assert ist_blockiert(db_session, pfarrei.id, Filtertag.ARBEITER, montag, time(10, 0)) is True


def test_anderer_wochentag_nicht_blockiert(db_session: Session, pfarrei: Pfarrei) -> None:
    _blocker(db_session, pfarrei, Filtertag.ARBEITER)
    dienstag = date(2026, 7, 7)
    assert (
        ist_blockiert(db_session, pfarrei.id, Filtertag.ARBEITER, dienstag, time(10, 0)) is False
    )


def test_schueler_blocker_in_ferien_aufgehoben(db_session: Session, pfarrei: Pfarrei) -> None:
    _blocker(db_session, pfarrei, Filtertag.SCHUELER)
    montag_in_ferien = date(2026, 8, 3)
    db_session.add(
        Ferienzeitraum(
            pfarrei_id=pfarrei.id,
            name="sommerferien",
            start_datum=date(2026, 8, 3),
            end_datum=date(2026, 9, 15),
            schuljahr="2025/2026",
        )
    )
    db_session.commit()

    assert (
        ist_blockiert(
            db_session, pfarrei.id, Filtertag.SCHUELER, montag_in_ferien, time(10, 0)
        )
        is False
    )


def test_arbeiter_blocker_bleibt_in_ferien_bestehen(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    _blocker(db_session, pfarrei, Filtertag.ARBEITER)
    montag_in_ferien = date(2026, 8, 3)
    db_session.add(
        Ferienzeitraum(
            pfarrei_id=pfarrei.id,
            name="sommerferien",
            start_datum=date(2026, 8, 3),
            end_datum=date(2026, 9, 15),
            schuljahr="2025/2026",
        )
    )
    db_session.commit()

    assert (
        ist_blockiert(
            db_session, pfarrei.id, Filtertag.ARBEITER, montag_in_ferien, time(10, 0)
        )
        is True
    )


def test_schueler_blocker_an_schulfreiem_feiertag_aufgehoben(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, Filtertag.SCHUELER, wochentag=fronleichnam.weekday())

    assert (
        ist_blockiert(db_session, pfarrei.id, Filtertag.SCHUELER, fronleichnam, time(10, 0))
        is False
    )


def test_arbeiter_blocker_an_feiertag_ohne_arbeiter_frei_bestehen(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, Filtertag.ARBEITER, wochentag=fronleichnam.weekday())

    assert (
        ist_blockiert(db_session, pfarrei.id, Filtertag.ARBEITER, fronleichnam, time(10, 0))
        is True
    )


def test_arbeiter_blocker_an_feiertag_mit_arbeiter_frei_aufgehoben(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, Filtertag.ARBEITER, wochentag=fronleichnam.weekday())
    db_session.add(
        FeiertagEinstellung(
            pfarrei_id=pfarrei.id,
            feiertag_key="fronleichnam",
            schulfrei=True,
            arbeiter_frei=True,
        )
    )
    db_session.commit()

    assert (
        ist_blockiert(db_session, pfarrei.id, Filtertag.ARBEITER, fronleichnam, time(10, 0))
        is False
    )
