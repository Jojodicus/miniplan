from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.gruppe import GruppeCreate, GruppeOut, GruppeUpdate

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/gruppen", tags=["gruppen"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _get_gruppe_or_404(pfarrei_id: int, gruppe_id: int, db: Session) -> Gruppe:
    gruppe = (
        db.query(Gruppe).filter(Gruppe.id == gruppe_id, Gruppe.pfarrei_id == pfarrei_id).first()
    )
    if gruppe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gruppe nicht gefunden")
    return gruppe


@router.get("", response_model=list[GruppeOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Gruppe]:
    return db.query(Gruppe).filter(Gruppe.pfarrei_id == pfarrei_id).order_by(Gruppe.name).all()


@router.post("", response_model=GruppeOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: GruppeCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Gruppe:
    gruppe = Gruppe(pfarrei_id=pfarrei_id, name=daten.name)
    db.add(gruppe)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gruppe mit diesem Namen existiert bereits",
        ) from None
    db.refresh(gruppe)
    return gruppe


@router.put("/{gruppe_id}", response_model=GruppeOut)
def bearbeiten(
    pfarrei_id: int,
    gruppe_id: int,
    daten: GruppeUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Gruppe:
    gruppe = _get_gruppe_or_404(pfarrei_id, gruppe_id, db)
    gruppe.name = daten.name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gruppe mit diesem Namen existiert bereits",
        ) from None
    db.refresh(gruppe)
    return gruppe


@router.delete("/{gruppe_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    gruppe_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    gruppe = _get_gruppe_or_404(pfarrei_id, gruppe_id, db)
    if db.query(Mini).filter(Mini.gruppe_id == gruppe_id).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Gruppe wird noch von Minis verwendet",
        )
    # DienstTypGruppenAnforderung/DienstbedarfGruppenAnforderung-Zeilen werden per
    # ON DELETE CASCADE mitgelöscht (siehe models/dienst_typ.py, models/dienstbedarf.py).
    db.delete(gruppe)
    db.commit()
