from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.mini import MiniCreate, MiniOut, MiniUpdate
from app.services.filtertag_validation import unbekannte_filtertag_keys

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/minis", tags=["minis"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _get_mini_or_404(pfarrei_id: int, mini_id: int, db: Session) -> Mini:
    mini = db.query(Mini).filter(Mini.id == mini_id, Mini.pfarrei_id == pfarrei_id).first()
    if mini is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mini nicht gefunden")
    return mini


def _gruppe_pruefen(pfarrei_id: int, gruppe_id: int, db: Session) -> None:
    gehoert_zur_pfarrei = (
        db.query(Gruppe).filter(Gruppe.id == gruppe_id, Gruppe.pfarrei_id == pfarrei_id).first()
        is not None
    )
    if not gehoert_zur_pfarrei:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gruppe gehört nicht zu dieser Pfarrei",
        )


def _filtertags_pruefen(pfarrei_id: int, filtertags: list[str], db: Session) -> None:
    unbekannt = unbekannte_filtertag_keys(pfarrei_id, set(filtertags), db)
    if unbekannt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unbekannte Filtertags: {', '.join(sorted(unbekannt))}",
        )


@router.get("", response_model=list[MiniOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Mini]:
    return db.query(Mini).filter(Mini.pfarrei_id == pfarrei_id).order_by(Mini.name).all()


@router.post("", response_model=MiniOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: MiniCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Mini:
    _gruppe_pruefen(pfarrei_id, daten.gruppe_id, db)
    _filtertags_pruefen(pfarrei_id, daten.filtertags, db)
    mini = Mini(
        pfarrei_id=pfarrei_id,
        gruppe_id=daten.gruppe_id,
        name=daten.name,
        filtertags=daten.filtertags,
        max_einsaetze_pro_monat=daten.max_einsaetze_pro_monat,
    )
    db.add(mini)
    db.commit()
    db.refresh(mini)
    return mini


@router.put("/{mini_id}", response_model=MiniOut)
def bearbeiten(
    pfarrei_id: int,
    mini_id: int,
    daten: MiniUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Mini:
    mini = _get_mini_or_404(pfarrei_id, mini_id, db)
    _gruppe_pruefen(pfarrei_id, daten.gruppe_id, db)
    _filtertags_pruefen(pfarrei_id, daten.filtertags, db)
    mini.name = daten.name
    mini.gruppe_id = daten.gruppe_id
    mini.filtertags = daten.filtertags
    mini.max_einsaetze_pro_monat = daten.max_einsaetze_pro_monat
    db.commit()
    db.refresh(mini)
    return mini


@router.delete("/{mini_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    mini_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    mini = _get_mini_or_404(pfarrei_id, mini_id, db)
    db.delete(mini)
    db.commit()
