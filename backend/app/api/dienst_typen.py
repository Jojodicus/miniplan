from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.dienst_typ import DienstTyp
from app.models.gruppe import Gruppe
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.dienst_typ import DienstTypCreate, DienstTypOut, DienstTypUpdate

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/dienst-typen", tags=["dienst-typen"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _get_dienst_typ_or_404(pfarrei_id: int, dienst_typ_id: int, db: Session) -> DienstTyp:
    dienst_typ = (
        db.query(DienstTyp)
        .filter(DienstTyp.id == dienst_typ_id, DienstTyp.pfarrei_id == pfarrei_id)
        .first()
    )
    if dienst_typ is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dienst-Typ nicht gefunden"
        )
    return dienst_typ


def _gruppen_laden(pfarrei_id: int, gruppen_ids: list[int], db: Session) -> list[Gruppe]:
    if not gruppen_ids:
        return []
    gruppen = (
        db.query(Gruppe)
        .filter(Gruppe.id.in_(gruppen_ids), Gruppe.pfarrei_id == pfarrei_id)
        .all()
    )
    if len(gruppen) != len(set(gruppen_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Eine oder mehrere Gruppen gehören nicht zu dieser Pfarrei",
        )
    return gruppen


@router.get("", response_model=list[DienstTypOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[DienstTyp]:
    return (
        db.query(DienstTyp)
        .filter(DienstTyp.pfarrei_id == pfarrei_id)
        .order_by(DienstTyp.name)
        .all()
    )


@router.post("", response_model=DienstTypOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: DienstTypCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> DienstTyp:
    gruppen = _gruppen_laden(pfarrei_id, daten.erlaubte_gruppen_ids, db)
    dienst_typ = DienstTyp(
        pfarrei_id=pfarrei_id,
        name=daten.name,
        standard_anzahl=daten.standard_anzahl,
        erforderliche_filtertags=[tag.value for tag in daten.erforderliche_filtertags],
        erlaubte_gruppen=gruppen,
    )
    db.add(dienst_typ)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dienst-Typ mit diesem Namen existiert bereits",
        ) from None
    db.refresh(dienst_typ)
    return dienst_typ


@router.put("/{dienst_typ_id}", response_model=DienstTypOut)
def bearbeiten(
    pfarrei_id: int,
    dienst_typ_id: int,
    daten: DienstTypUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> DienstTyp:
    dienst_typ = _get_dienst_typ_or_404(pfarrei_id, dienst_typ_id, db)
    gruppen = _gruppen_laden(pfarrei_id, daten.erlaubte_gruppen_ids, db)
    dienst_typ.name = daten.name
    dienst_typ.standard_anzahl = daten.standard_anzahl
    dienst_typ.erforderliche_filtertags = [tag.value for tag in daten.erforderliche_filtertags]
    dienst_typ.erlaubte_gruppen = gruppen
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dienst-Typ mit diesem Namen existiert bereits",
        ) from None
    db.refresh(dienst_typ)
    return dienst_typ


@router.delete("/{dienst_typ_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    dienst_typ_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    dienst_typ = _get_dienst_typ_or_404(pfarrei_id, dienst_typ_id, db)
    db.delete(dienst_typ)
    db.commit()
