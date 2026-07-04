from datetime import date, time

from sqlalchemy.orm import Session

from app.models.feiertag_einstellung import FeiertagEinstellung
from app.models.ferienzeitraum import Ferienzeitraum
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.pfarrei import Pfarrei
from app.services.feiertage import berechne_feiertage

SCHUELER_FILTERTAGS = {Filtertag.SCHUELER, Filtertag.GRUNDSCHUELER}


def _in_ferien(db: Session, pfarrei_id: int, datum: date) -> bool:
    return (
        db.query(Ferienzeitraum)
        .filter(
            Ferienzeitraum.pfarrei_id == pfarrei_id,
            Ferienzeitraum.start_datum <= datum,
            Ferienzeitraum.end_datum >= datum,
        )
        .first()
        is not None
    )


def _feiertag_einstellung(db: Session, pfarrei: Pfarrei, datum: date) -> FeiertagEinstellung | None:
    feiertage = berechne_feiertage(pfarrei.bundesland.value, datum.year)
    treffer = next((f for f in feiertage if f["datum"] == datum), None)
    if treffer is None:
        return None
    einstellung = (
        db.query(FeiertagEinstellung)
        .filter(
            FeiertagEinstellung.pfarrei_id == pfarrei.id,
            FeiertagEinstellung.feiertag_key == treffer["key"],
        )
        .first()
    )
    if einstellung is not None:
        return einstellung
    return FeiertagEinstellung(schulfrei=True, arbeiter_frei=False)


def ist_blockiert(db: Session, pfarrei_id: int, filtertag: Filtertag, datum: date, zeit: time) -> bool:
    if filtertag in SCHUELER_FILTERTAGS and _in_ferien(db, pfarrei_id, datum):
        return False

    pfarrei = db.get(Pfarrei, pfarrei_id)
    if pfarrei is not None:
        feiertag_einstellung = _feiertag_einstellung(db, pfarrei, datum)
        if feiertag_einstellung is not None:
            if filtertag in SCHUELER_FILTERTAGS and feiertag_einstellung.schulfrei:
                return False
            if filtertag == Filtertag.ARBEITER and feiertag_einstellung.arbeiter_frei:
                return False

    wochentag = datum.weekday()
    blocker = (
        db.query(FiltertagBlocker)
        .filter(
            FiltertagBlocker.pfarrei_id == pfarrei_id,
            FiltertagBlocker.filtertag == filtertag,
            FiltertagBlocker.wochentag == wochentag,
            FiltertagBlocker.start_zeit <= zeit,
            FiltertagBlocker.end_zeit >= zeit,
        )
        .first()
    )
    return blocker is not None
