from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, require_admin
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.pfarrei import PfarreiOut

router = APIRouter(prefix="/api/pfarreien", tags=["pfarreien"])

require_pfarrei_zugriff = RequirePfarreiRolle(
    PfarreiRolle.PFARREI_VERANTWORTLICHER, PfarreiRolle.BETRACHTER
)


@router.get("", response_model=list[PfarreiOut])
def liste(db: Session = Depends(get_db), _=Depends(require_admin)) -> list[Pfarrei]:
    return db.query(Pfarrei).order_by(Pfarrei.name).all()


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
