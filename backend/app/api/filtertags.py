import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.filtertag import FiltertagCreate, FiltertagOut, FiltertagUpdate

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/filtertags", tags=["filtertags"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _slug(text: str) -> str:
    normalisiert = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalisiert.lower()).strip("-")
    return slug or "status"


def _eindeutiger_key(pfarrei_id: int, label: str, db: Session) -> str:
    basis = _slug(label)
    vorhandene_keys = {
        row[0] for row in db.query(Filtertag.key).filter(Filtertag.pfarrei_id == pfarrei_id).all()
    }
    if basis not in vorhandene_keys:
        return basis
    zaehler = 2
    while f"{basis}-{zaehler}" in vorhandene_keys:
        zaehler += 1
    return f"{basis}-{zaehler}"


def _get_filtertag_or_404(pfarrei_id: int, filtertag_id: int, db: Session) -> Filtertag:
    filtertag = (
        db.query(Filtertag)
        .filter(Filtertag.id == filtertag_id, Filtertag.pfarrei_id == pfarrei_id)
        .first()
    )
    if filtertag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Filtertag nicht gefunden"
        )
    return filtertag


@router.get("", response_model=list[FiltertagOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Filtertag]:
    return db.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei_id).order_by(Filtertag.label).all()


@router.post("", response_model=FiltertagOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: FiltertagCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Filtertag:
    key = _eindeutiger_key(pfarrei_id, daten.label, db)
    filtertag = Filtertag(pfarrei_id=pfarrei_id, key=key, **daten.model_dump())
    db.add(filtertag)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Verfügbarkeits-Status mit dieser Bezeichnung existiert bereits",
        ) from None
    db.refresh(filtertag)
    return filtertag


@router.put("/{filtertag_id}", response_model=FiltertagOut)
def bearbeiten(
    pfarrei_id: int,
    filtertag_id: int,
    daten: FiltertagUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Filtertag:
    filtertag = _get_filtertag_or_404(pfarrei_id, filtertag_id, db)
    filtertag.label = daten.label
    filtertag.ist_schueler_artig = daten.ist_schueler_artig
    db.commit()
    db.refresh(filtertag)
    return filtertag


@router.delete("/{filtertag_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    filtertag_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    filtertag = _get_filtertag_or_404(pfarrei_id, filtertag_id, db)
    db.delete(filtertag)
    db.commit()
