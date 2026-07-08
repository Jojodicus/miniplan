from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.dienstbedarf import DienstbedarfZuweisung
from app.models.filtertag import Filtertag
from app.models.miniplan import Miniplan, MiniplanStatus
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.miniplan import MiniplanCreate, MiniplanOut, MiniplanStatusUpdate, MiniplanUpdate
from app.schemas.miniplan_vorschau import MiniplanVorschauIn, miniplan_zu_vorschau
from app.services.typst_render import TypstCompileError, render_miniplan_pdf
from app.services.zuteilung import zuteilung_vorschlagen

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/miniplaene", tags=["miniplaene"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)
require_lesend = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER, PfarreiRolle.BETRACHTER)


def _get_miniplan_or_404(pfarrei_id: int, miniplan_id: int, db: Session) -> Miniplan:
    miniplan = (
        db.query(Miniplan)
        .filter(Miniplan.id == miniplan_id, Miniplan.pfarrei_id == pfarrei_id)
        .first()
    )
    if miniplan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Miniplan nicht gefunden"
        )
    return miniplan


@router.get("", response_model=list[MiniplanOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Miniplan]:
    return (
        db.query(Miniplan)
        .filter(Miniplan.pfarrei_id == pfarrei_id)
        .order_by(Miniplan.jahr.desc(), Miniplan.monat.desc())
        .all()
    )


@router.post("", response_model=MiniplanOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: MiniplanCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = Miniplan(pfarrei_id=pfarrei_id, monat=daten.monat, jahr=daten.jahr)
    db.add(miniplan)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Für diesen Monat existiert bereits ein Miniplan",
        ) from None
    db.refresh(miniplan)
    return miniplan


@router.get("/{miniplan_id}", response_model=MiniplanOut)
def detail(
    pfarrei_id: int,
    miniplan_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    return _get_miniplan_or_404(pfarrei_id, miniplan_id, db)


@router.put("/{miniplan_id}", response_model=MiniplanOut)
def bearbeiten(
    pfarrei_id: int,
    miniplan_id: int,
    daten: MiniplanUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    miniplan.veranstaltungen = daten.veranstaltungen
    miniplan.ankuendigungen = daten.ankuendigungen
    db.commit()
    db.refresh(miniplan)
    return miniplan


@router.post("/{miniplan_id}/status", response_model=MiniplanOut)
def status_aendern(
    pfarrei_id: int,
    miniplan_id: int,
    daten: MiniplanStatusUpdate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    miniplan.status = daten.status
    db.commit()
    db.refresh(miniplan)
    return miniplan


@router.post("/{miniplan_id}/fuellen", response_model=MiniplanOut)
def fuellen(
    pfarrei_id: int,
    miniplan_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    vorschlag = zuteilung_vorschlagen(db, pfarrei_id, miniplan)
    for gottesdienst in miniplan.gottesdienste:
        for bedarf in gottesdienst.dienstbedarf:
            fixierte = [z for z in bedarf.zuweisungen if z.manuell_fixiert]
            bedarf.zuweisungen = fixierte + [
                DienstbedarfZuweisung(mini_id=mini_id, manuell_fixiert=False)
                for mini_id in vorschlag.get(bedarf.id, [])
            ]
    db.commit()
    db.refresh(miniplan)
    return miniplan


@router.get("/{miniplan_id}/pdf")
def pdf_herunterladen(
    pfarrei_id: int,
    miniplan_id: int,
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_lesend),
) -> Response:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    if miniplan.status != MiniplanStatus.ABGESCHLOSSEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nur abgeschlossene Minipläne können heruntergeladen werden",
        )
    filtertag_labels = {
        f.key: f.label
        for f in db.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei_id).all()
    }
    try:
        pdf_bytes = render_miniplan_pdf(
            pfarrei.name, miniplan_zu_vorschau(miniplan), filtertag_labels
        )
    except TypstCompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"fehler": exc.errors},
        ) from exc
    dateiname = f"miniplan-{miniplan.jahr}-{miniplan.monat:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{dateiname}"'},
    )


@router.post("/{miniplan_id}/vorschau")
def vorschau(
    pfarrei_id: int,
    miniplan_id: int,
    daten: MiniplanVorschauIn,
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Response:
    _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    filtertag_labels = {
        f.key: f.label
        for f in db.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei_id).all()
    }
    try:
        pdf_bytes = render_miniplan_pdf(pfarrei.name, daten, filtertag_labels)
    except TypstCompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"fehler": exc.errors},
        ) from exc
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.delete("/{miniplan_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    miniplan_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    db.delete(miniplan)
    db.commit()
