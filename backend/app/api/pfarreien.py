from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_current_user, get_pfarrei, require_admin
from app.models.ferienzeitraum import Ferienzeitraum
from app.models.nutzer import Nutzer, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.ferienzeitraum import FerienzeitraumOut
from app.schemas.pfarrei import PfarreiBundeslandUpdate, PfarreiOut
from app.services.ferien_sync import FerienSyncFehler, sync_ferien

router = APIRouter(prefix="/api/pfarreien", tags=["pfarreien"])

require_pfarrei_zugriff = RequirePfarreiRolle(
    PfarreiRolle.PFARREI_VERANTWORTLICHER, PfarreiRolle.BETRACHTER
)
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


@router.get("", response_model=list[PfarreiOut])
def liste(db: Session = Depends(get_db), _=Depends(require_admin)) -> list[Pfarrei]:
    return db.query(Pfarrei).order_by(Pfarrei.name).all()


@router.get("/mine", response_model=list[PfarreiOut])
def meine_pfarreien(
    db: Session = Depends(get_db),
    current_user: Nutzer = Depends(get_current_user),
) -> list[Pfarrei]:
    if current_user.ist_admin:
        return db.query(Pfarrei).order_by(Pfarrei.name).all()
    pfarrei_ids = {zuordnung.pfarrei_id for zuordnung in current_user.pfarrei_rollen}
    if not pfarrei_ids:
        return []
    return db.query(Pfarrei).filter(Pfarrei.id.in_(pfarrei_ids)).order_by(Pfarrei.name).all()


@router.get("/{pfarrei_id}", response_model=PfarreiOut)
def detail(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_pfarrei_zugriff),
) -> Pfarrei:
    pfarrei = db.get(Pfarrei, pfarrei_id)
    if pfarrei is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pfarrei nicht gefunden")
    return pfarrei


@router.put("/{pfarrei_id}/bundesland", response_model=PfarreiOut)
def bundesland_setzen(
    pfarrei_id: int,
    daten: PfarreiBundeslandUpdate,
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Pfarrei:
    pfarrei.bundesland = daten.bundesland
    db.commit()
    db.refresh(pfarrei)
    # Best-effort: schlägt die externe Ferien-Quelle fehl, bleiben bestehende Ferienzeiten
    # erhalten (siehe sync_ferien) - das Setzen des Bundeslands soll dadurch nicht scheitern.
    try:
        sync_ferien(pfarrei, db)
    except FerienSyncFehler:
        pass
    return pfarrei


@router.get("/{pfarrei_id}/ferien", response_model=list[FerienzeitraumOut])
def ferien_liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Ferienzeitraum]:
    return (
        db.query(Ferienzeitraum)
        .filter(Ferienzeitraum.pfarrei_id == pfarrei_id)
        .order_by(Ferienzeitraum.start_datum)
        .all()
    )


@router.post("/{pfarrei_id}/ferien/aktualisieren", response_model=list[FerienzeitraumOut])
def ferien_aktualisieren(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Ferienzeitraum]:
    try:
        return sync_ferien(pfarrei, db)
    except FerienSyncFehler as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from None
