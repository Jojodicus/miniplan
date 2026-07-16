import contextlib

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_current_user, get_pfarrei, require_admin
from app.models.ferienzeitraum import Ferienzeitraum
from app.models.nutzer import Nutzer, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.ferienzeitraum import FerienzeitraumOut
from app.schemas.pfarrei import PfarreiBundeslandUpdate, PfarreiOut
from app.services.ferien_sync import FerienSyncFehler, sync_ferien, sync_ferien_falls_fehlend
from app.services.pfarrei_bild import (
    ERLAUBTE_TYPEN,
    MAX_BYTES,
    bild_loeschen,
    bild_pfad,
    bild_speichern,
)

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


@router.get("/{pfarrei_id}/bild")
def bild_abrufen(
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_pfarrei_zugriff),
) -> FileResponse:
    if pfarrei.bild_dateiname is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kein Bild vorhanden")
    try:
        pfad = bild_pfad(pfarrei.bild_dateiname)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bild nicht gefunden"
        ) from exc
    if not pfad.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bild nicht gefunden")
    return FileResponse(pfad)


@router.put("/{pfarrei_id}/bild", response_model=PfarreiOut)
async def bild_hochladen(
    datei: UploadFile = File(...),
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Pfarrei:
    if datei.content_type not in ERLAUBTE_TYPEN:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Nur PNG-, JPEG- oder WebP-Bilder werden unterstützt",
        )
    inhalt = await datei.read()
    if len(inhalt) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Das Bild ist zu groß (max. 5 MB)",
        )
    pfarrei.bild_dateiname = bild_speichern(pfarrei.id, datei.content_type, inhalt)
    db.commit()
    db.refresh(pfarrei)
    return pfarrei


@router.delete("/{pfarrei_id}/bild", response_model=PfarreiOut)
def bild_entfernen(
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Pfarrei:
    if pfarrei.bild_dateiname is not None:
        bild_loeschen(pfarrei.bild_dateiname)
        pfarrei.bild_dateiname = None
        db.commit()
        db.refresh(pfarrei)
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
    with contextlib.suppress(FerienSyncFehler):
        sync_ferien(pfarrei, db)
    return pfarrei


@router.get("/{pfarrei_id}/ferien", response_model=list[FerienzeitraumOut])
def ferien_liste(
    pfarrei_id: int,
    jahr: int | None = Query(default=None),
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Ferienzeitraum]:
    # `jahr` ist optional und stößt best-effort einen Sync für genau dieses (noch nicht
    # gespeicherte) Jahr an - z.B. wenn der Datums-Picker im Frontend einen neuen Monat anzeigt.
    # Schlägt die externe Quelle fehl, liefert der Endpunkt trotzdem den bisherigen Bestand statt
    # eines Fehlers, damit ein reines Kalender-Öffnen nie fehlschlägt.
    if jahr is not None:
        with contextlib.suppress(FerienSyncFehler):
            sync_ferien_falls_fehlend(pfarrei, db, {jahr})
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
        status_code = (
            status.HTTP_429_TOO_MANY_REQUESTS if exc.rate_limited else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from None
