from datetime import date, time

from sqlalchemy.orm import Session

from app.models.feiertag_einstellung import FeiertagEinstellung
from app.models.ferienzeitraum import Ferienzeitraum
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.pfarrei import Pfarrei
from app.services.verfuegbarkeit import ist_blockiert


def _filtertag(
    db_session: Session, pfarrei: Pfarrei, key: str, ist_schueler_artig: bool
) -> Filtertag:
    obj = Filtertag(
        pfarrei_id=pfarrei.id,
        key=key,
        label=key,
        ist_schueler_artig=ist_schueler_artig,
    )
    db_session.add(obj)
    db_session.commit()
    db_session.refresh(obj)
    return obj


def _blocker(
    db_session: Session, pfarrei: Pfarrei, filtertag: Filtertag, wochentag: int = 0
) -> None:
    db_session.add(
        FiltertagBlocker(
            pfarrei_id=pfarrei.id,
            filtertag_id=filtertag.id,
            wochentag=wochentag,
            start_zeit=time(8, 0),
            end_zeit=time(13, 0),
        )
    )
    db_session.commit()


def test_ausserhalb_des_blocker_fensters_nicht_blockiert(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    _blocker(db_session, pfarrei, arbeiter)
    montag = date(2026, 7, 6)
    assert ist_blockiert(db_session, pfarrei.id, arbeiter.id, montag, time(14, 0)) is False


def test_innerhalb_des_blocker_fensters_blockiert(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    _blocker(db_session, pfarrei, arbeiter)
    montag = date(2026, 7, 6)
    assert ist_blockiert(db_session, pfarrei.id, arbeiter.id, montag, time(10, 0)) is True


def test_anderer_wochentag_nicht_blockiert(db_session: Session, pfarrei: Pfarrei) -> None:
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    _blocker(db_session, pfarrei, arbeiter)
    dienstag = date(2026, 7, 7)
    assert ist_blockiert(db_session, pfarrei.id, arbeiter.id, dienstag, time(10, 0)) is False


def test_schueler_blocker_in_ferien_aufgehoben(db_session: Session, pfarrei: Pfarrei) -> None:
    schueler = _filtertag(db_session, pfarrei, "schueler", True)
    _blocker(db_session, pfarrei, schueler)
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
        ist_blockiert(db_session, pfarrei.id, schueler.id, montag_in_ferien, time(10, 0))
        is False
    )


def test_arbeiter_blocker_bleibt_in_ferien_bestehen(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    _blocker(db_session, pfarrei, arbeiter)
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
        ist_blockiert(db_session, pfarrei.id, arbeiter.id, montag_in_ferien, time(10, 0))
        is True
    )


def test_schueler_blocker_an_schulfreiem_feiertag_aufgehoben(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    schueler = _filtertag(db_session, pfarrei, "schueler", True)
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, schueler, wochentag=fronleichnam.weekday())

    assert (
        ist_blockiert(db_session, pfarrei.id, schueler.id, fronleichnam, time(10, 0)) is False
    )


def test_arbeiter_blocker_an_gesetzlichem_feiertag_default_aufgehoben(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    """Fronleichnam ist ein gesetzlicher, arbeitsfreier Feiertag - ohne explizite
    `FeiertagEinstellung` gilt seit Umstellung auf `default_arbeiter_frei` daher
    arbeiter_frei=True by default (statt wie zuvor blanket False für alle Feiertage)."""
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, arbeiter, wochentag=fronleichnam.weekday())

    assert (
        ist_blockiert(db_session, pfarrei.id, arbeiter.id, fronleichnam, time(10, 0)) is False
    )


def test_arbeiter_blocker_mit_expliziter_arbeiter_frei_false_einstellung_bestehen(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, arbeiter, wochentag=fronleichnam.weekday())
    db_session.add(
        FeiertagEinstellung(
            pfarrei_id=pfarrei.id,
            feiertag_key="fronleichnam",
            schulfrei=True,
            arbeiter_frei=False,
        )
    )
    db_session.commit()

    assert (
        ist_blockiert(db_session, pfarrei.id, arbeiter.id, fronleichnam, time(10, 0)) is True
    )


def test_arbeiter_blocker_an_feiertag_mit_arbeiter_frei_aufgehoben(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    arbeiter = _filtertag(db_session, pfarrei, "arbeiter", False)
    fronleichnam = date(2026, 6, 4)
    _blocker(db_session, pfarrei, arbeiter, wochentag=fronleichnam.weekday())
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
        ist_blockiert(db_session, pfarrei.id, arbeiter.id, fronleichnam, time(10, 0)) is False
    )
