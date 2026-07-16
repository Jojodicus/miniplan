from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api._helpers import get_or_404
from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.filtertag_blocker import (
    FiltertagBlockerCreate,
    FiltertagBlockerOut,
    FiltertagBlockerUpdate,
)

router = APIRouter(
    prefix="/api/pfarreien/{pfarrei_id}/filtertag-blocker", tags=["filtertag-blocker"]
)
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _get_blocker_or_404(pfarrei_id: int, blocker_id: int, db: Session) -> FiltertagBlocker:
    return get_or_404(
        db,
        FiltertagBlocker,
        blocker_id,
        pfarrei_id=pfarrei_id,
        not_found_detail="Blocker nicht gefunden",
    )


def _filtertag_pruefen(pfarrei_id: int, filtertag_id: int, db: Session) -> None:
    gehoert_zur_pfarrei = (
        db.query(Filtertag)
        .filter(Filtertag.id == filtertag_id, Filtertag.pfarrei_id == pfarrei_id)
        .first()
        is not None
    )
    if not gehoert_zur_pfarrei:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filtertag gehört nicht zu dieser Pfarrei",
        )


@router.get("", response_model=list[FiltertagBlockerOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[FiltertagBlocker]:
    return (
        db.query(FiltertagBlocker)
        .filter(FiltertagBlocker.pfarrei_id == pfarrei_id)
        .order_by(
            FiltertagBlocker.filtertag_id, FiltertagBlocker.wochentag, FiltertagBlocker.start_zeit
        )
        .all()
    )


@router.post("", response_model=FiltertagBlockerOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: FiltertagBlockerCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> FiltertagBlocker:
    _filtertag_pruefen(pfarrei_id, daten.filtertag_id, db)
    blocker = FiltertagBlocker(pfarrei_id=pfarrei_id, **daten.model_dump())
    db.add(blocker)
    db.commit()
    db.refresh(blocker)
    return blocker


@router.put("/{blocker_id}", response_model=FiltertagBlockerOut)
def bearbeiten(
    pfarrei_id: int,
    blocker_id: int,
    daten: FiltertagBlockerUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> FiltertagBlocker:
    blocker = _get_blocker_or_404(pfarrei_id, blocker_id, db)
    _filtertag_pruefen(pfarrei_id, daten.filtertag_id, db)
    for feld, wert in daten.model_dump().items():
        setattr(blocker, feld, wert)
    db.commit()
    db.refresh(blocker)
    return blocker


@router.delete("/{blocker_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    blocker_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    blocker = _get_blocker_or_404(pfarrei_id, blocker_id, db)
    db.delete(blocker)
    db.commit()
