from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.dienst_typ import DienstTyp, DienstTypGruppenAnforderung
from app.models.gruppe import Gruppe
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.dienst_typ import (
    DienstTypCreate,
    DienstTypOut,
    DienstTypUpdate,
    GruppenAnforderung,
)

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


def _gruppen_anforderungen_bauen(
    pfarrei_id: int, anforderungen: list[GruppenAnforderung], db: Session
) -> list[DienstTypGruppenAnforderung]:
    if not anforderungen:
        return []
    gruppen_ids = [a.gruppe_id for a in anforderungen]
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
    gruppen_by_id = {g.id: g for g in gruppen}
    return [
        DienstTypGruppenAnforderung(
            gruppe_id=a.gruppe_id, mindest_anzahl=a.mindest_anzahl, gruppe=gruppen_by_id[a.gruppe_id]
        )
        for a in anforderungen
    ]


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
    gruppen_anforderungen = _gruppen_anforderungen_bauen(
        pfarrei_id, daten.gruppen_anforderungen, db
    )
    dienst_typ = DienstTyp(
        pfarrei_id=pfarrei_id,
        name=daten.name,
        standard_anzahl=daten.standard_anzahl,
        gruppen_anforderungen=gruppen_anforderungen,
        zeige_label=daten.zeige_label,
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
    gruppen_anforderungen = _gruppen_anforderungen_bauen(
        pfarrei_id, daten.gruppen_anforderungen, db
    )
    dienst_typ.name = daten.name
    dienst_typ.standard_anzahl = daten.standard_anzahl
    dienst_typ.gruppen_anforderungen = gruppen_anforderungen
    dienst_typ.zeige_label = daten.zeige_label
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
