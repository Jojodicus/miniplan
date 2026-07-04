from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.feiertag_einstellung import FeiertagEinstellung
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.feiertag import FeiertagEinstellungUpdate, FeiertagOut
from app.services.feiertage import berechne_feiertage, default_arbeiter_frei

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/feiertage", tags=["feiertage"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _einstellungen_laden(pfarrei_id: int, db: Session) -> dict[str, FeiertagEinstellung]:
    eintraege = (
        db.query(FeiertagEinstellung).filter(FeiertagEinstellung.pfarrei_id == pfarrei_id).all()
    )
    return {eintrag.feiertag_key: eintrag for eintrag in eintraege}


@router.get("", response_model=list[FeiertagOut])
def liste(
    pfarrei_id: int,
    jahr: int | None = None,
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[FeiertagOut]:
    einstellungen = _einstellungen_laden(pfarrei_id, db)
    berechnete = berechne_feiertage(pfarrei.bundesland.value, jahr or date.today().year)
    return [
        FeiertagOut(
            key=f["key"],
            name=f["name"],
            datum=f["datum"],
            schulfrei=einstellungen[f["key"]].schulfrei if f["key"] in einstellungen else True,
            arbeiter_frei=einstellungen[f["key"]].arbeiter_frei
            if f["key"] in einstellungen
            else default_arbeiter_frei(f["key"]),
        )
        for f in berechnete
    ]


@router.put("/{feiertag_key}", response_model=FeiertagEinstellungUpdate)
def einstellung_setzen(
    pfarrei_id: int,
    feiertag_key: str,
    daten: FeiertagEinstellungUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> FeiertagEinstellung:
    einstellung = (
        db.query(FeiertagEinstellung)
        .filter(
            FeiertagEinstellung.pfarrei_id == pfarrei_id,
            FeiertagEinstellung.feiertag_key == feiertag_key,
        )
        .first()
    )
    if einstellung is None:
        einstellung = FeiertagEinstellung(pfarrei_id=pfarrei_id, feiertag_key=feiertag_key)
        db.add(einstellung)
    einstellung.schulfrei = daten.schulfrei
    einstellung.arbeiter_frei = daten.arbeiter_frei
    db.commit()
    db.refresh(einstellung)
    return einstellung
