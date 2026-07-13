import contextlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models.nutzer import Nutzer, NutzerPfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.nutzer import (
    NutzerCreate,
    NutzerOut,
    NutzerUpdate,
    PasswortReset,
    PfarreiRolleZuweisung,
)
from app.schemas.pfarrei import PfarreiCreate, PfarreiOut, PfarreiUpdate
from app.security import hash_password
from app.services.ferien_sync import FerienSyncFehler, sync_ferien
from app.services.stammdaten_seed import seed_default_stammdaten

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _get_nutzer_or_404(nutzer_id: int, db: Session) -> Nutzer:
    nutzer = db.get(Nutzer, nutzer_id)
    if nutzer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nutzer nicht gefunden")
    return nutzer


def _get_pfarrei_or_404(pfarrei_id: int, db: Session) -> Pfarrei:
    pfarrei = db.get(Pfarrei, pfarrei_id)
    if pfarrei is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pfarrei nicht gefunden")
    return pfarrei


def _anzahl_admins(db: Session, ausser_nutzer_id: int | None = None) -> int:
    query = db.query(func.count(Nutzer.id)).filter(Nutzer.ist_admin.is_(True))
    if ausser_nutzer_id is not None:
        query = query.filter(Nutzer.id != ausser_nutzer_id)
    return query.scalar() or 0


# --- Nutzer -----------------------------------------------------------------


@router.get("/nutzer", response_model=list[NutzerOut])
def nutzer_liste(db: Session = Depends(get_db)) -> list[Nutzer]:
    return db.query(Nutzer).order_by(Nutzer.email).all()


@router.post("/nutzer", response_model=NutzerOut, status_code=status.HTTP_201_CREATED)
def nutzer_anlegen(daten: NutzerCreate, db: Session = Depends(get_db)) -> Nutzer:
    nutzer = Nutzer(
        email=daten.email.strip().lower(),
        password_hash=hash_password(daten.password),
        ist_admin=daten.ist_admin,
    )
    db.add(nutzer)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ein Nutzer mit dieser E-Mail existiert bereits",
        ) from None
    db.refresh(nutzer)
    return nutzer


@router.put("/nutzer/{nutzer_id}", response_model=NutzerOut)
def nutzer_bearbeiten(nutzer_id: int, daten: NutzerUpdate, db: Session = Depends(get_db)) -> Nutzer:
    nutzer = _get_nutzer_or_404(nutzer_id, db)
    # Den letzten verbleibenden Admin nicht zum Nicht-Admin herabstufen - sonst ist niemand mehr
    # zur Verwaltung berechtigt.
    if (
        nutzer.ist_admin
        and not daten.ist_admin
        and _anzahl_admins(db, ausser_nutzer_id=nutzer.id) == 0
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der letzte Admin kann nicht herabgestuft werden",
        )
    nutzer.email = daten.email.strip().lower()
    nutzer.ist_admin = daten.ist_admin
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ein Nutzer mit dieser E-Mail existiert bereits",
        ) from None
    db.refresh(nutzer)
    return nutzer


@router.post("/nutzer/{nutzer_id}/passwort", status_code=status.HTTP_204_NO_CONTENT)
def nutzer_passwort_zuruecksetzen(
    nutzer_id: int, daten: PasswortReset, db: Session = Depends(get_db)
) -> None:
    nutzer = _get_nutzer_or_404(nutzer_id, db)
    nutzer.password_hash = hash_password(daten.password)
    db.commit()


@router.delete("/nutzer/{nutzer_id}", status_code=status.HTTP_204_NO_CONTENT)
def nutzer_loeschen(
    nutzer_id: int,
    db: Session = Depends(get_db),
    aktueller_admin: Nutzer = Depends(require_admin),
) -> None:
    nutzer = _get_nutzer_or_404(nutzer_id, db)
    if nutzer.id == aktueller_admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der eigene Account kann nicht gelöscht werden",
        )
    if nutzer.ist_admin and _anzahl_admins(db, ausser_nutzer_id=nutzer.id) == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der letzte Admin kann nicht gelöscht werden",
        )
    db.delete(nutzer)
    db.commit()


@router.put("/nutzer/{nutzer_id}/pfarrei-rollen", response_model=NutzerOut)
def nutzer_pfarrei_rolle_setzen(
    nutzer_id: int, daten: PfarreiRolleZuweisung, db: Session = Depends(get_db)
) -> Nutzer:
    """Weist einem Nutzer eine Rolle in einer Pfarrei zu bzw. ändert sie (Upsert - pro Nutzer/
    Pfarrei existiert höchstens eine Rolle)."""
    nutzer = _get_nutzer_or_404(nutzer_id, db)
    _get_pfarrei_or_404(daten.pfarrei_id, db)
    bestehend = next((z for z in nutzer.pfarrei_rollen if z.pfarrei_id == daten.pfarrei_id), None)
    if bestehend is not None:
        bestehend.rolle = daten.rolle
    else:
        db.add(
            NutzerPfarreiRolle(nutzer_id=nutzer.id, pfarrei_id=daten.pfarrei_id, rolle=daten.rolle)
        )
    db.commit()
    db.refresh(nutzer)
    return nutzer


@router.delete("/nutzer/{nutzer_id}/pfarrei-rollen/{pfarrei_id}", response_model=NutzerOut)
def nutzer_pfarrei_rolle_entfernen(
    nutzer_id: int, pfarrei_id: int, db: Session = Depends(get_db)
) -> Nutzer:
    nutzer = _get_nutzer_or_404(nutzer_id, db)
    bestehend = next((z for z in nutzer.pfarrei_rollen if z.pfarrei_id == pfarrei_id), None)
    if bestehend is not None:
        db.delete(bestehend)
        db.commit()
        db.refresh(nutzer)
    return nutzer


# --- Pfarreien --------------------------------------------------------------


@router.post("/pfarreien", response_model=PfarreiOut, status_code=status.HTTP_201_CREATED)
def pfarrei_anlegen(daten: PfarreiCreate, db: Session = Depends(get_db)) -> Pfarrei:
    pfarrei = Pfarrei(name=daten.name.strip(), bundesland=daten.bundesland)
    db.add(pfarrei)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Eine Pfarrei mit diesem Namen existiert bereits",
        ) from None
    db.refresh(pfarrei)
    seed_default_stammdaten(db, pfarrei)
    # Best-effort: schlägt die externe Ferien-Quelle fehl, ist die Pfarrei trotzdem angelegt
    # (Ferien lassen sich später über "Aktualisieren" nachholen, siehe bundesland_setzen).
    with contextlib.suppress(FerienSyncFehler):
        sync_ferien(pfarrei, db)
    return pfarrei


@router.put("/pfarreien/{pfarrei_id}", response_model=PfarreiOut)
def pfarrei_bearbeiten(
    pfarrei_id: int, daten: PfarreiUpdate, db: Session = Depends(get_db)
) -> Pfarrei:
    pfarrei = _get_pfarrei_or_404(pfarrei_id, db)
    pfarrei.name = daten.name.strip()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Eine Pfarrei mit diesem Namen existiert bereits",
        ) from None
    db.refresh(pfarrei)
    return pfarrei


@router.delete("/pfarreien/{pfarrei_id}", status_code=status.HTTP_204_NO_CONTENT)
def pfarrei_loeschen(pfarrei_id: int, db: Session = Depends(get_db)) -> None:
    # Alle abhängigen Zeilen (Gruppen, Minis, DienstTypen, Filtertags, Miniplaene, ...) werden per
    # ON DELETE CASCADE mitgelöscht (siehe Modelle unter app/models/, PRAGMA foreign_keys=ON in
    # database.py).
    pfarrei = _get_pfarrei_or_404(pfarrei_id, db)
    db.delete(pfarrei)
    db.commit()
