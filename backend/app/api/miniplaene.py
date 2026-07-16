from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api._helpers import get_or_404
from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.dienstbedarf import (
    Dienstbedarf,
    DienstbedarfGruppenAnforderung,
    DienstbedarfZuweisung,
)
from app.models.gottesdienst import Gottesdienst
from app.models.mini import Mini
from app.models.mini_miniplan_limit import MiniMiniplanLimit
from app.models.miniplan import Miniplan, MiniplanStatus
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.dienstbedarf import (
    ZuweisungenLeerenIn,
    ZuweisungFixierungIn,
    ZuweisungTauschenIn,
)
from app.schemas.mini_miniplan_limit import MiniLimitIn
from app.schemas.miniplan import (
    MiniplanCreate,
    MiniplanListeOut,
    MiniplanOut,
    MiniplanStatusUpdate,
    MiniplanUpdate,
    ZuteilungEinstellungen,
)
from app.schemas.miniplan_vorschau import MiniplanVorschauIn, miniplan_zu_vorschau
from app.services import miniplan_operations
from app.services.typst_render import TypstCompileError, render_miniplan_pdf

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/miniplaene", tags=["miniplaene"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)
require_lesend = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER, PfarreiRolle.BETRACHTER)


def _planstand_optionen() -> list:
    """Lädt die komplette Gottesdienst/Dienstbedarf/Zuweisungs-Kette per selectinload statt der
    SQLAlchemy-Default-Lazy-Loads - sonst löst die Ausgabe der verschachtelten Response-Schemas
    (MiniplanOut) für jede Zeile eine eigene Query aus (N+1), was v.a. die alle 500ms aufgerufene
    Live-Vorschau spürbar verlangsamt."""
    return [
        selectinload(Miniplan.gottesdienste).options(
            selectinload(Gottesdienst.dienstbedarf).options(
                selectinload(Dienstbedarf.dienst_typ),
                selectinload(Dienstbedarf.gruppen_anforderungen).selectinload(
                    DienstbedarfGruppenAnforderung.gruppe
                ),
                selectinload(Dienstbedarf.zuweisungen).selectinload(DienstbedarfZuweisung.mini),
            )
        ),
        selectinload(Miniplan.mini_limits).selectinload(MiniMiniplanLimit.mini),
    ]


def _get_miniplan_or_404(pfarrei_id: int, miniplan_id: int, db: Session) -> Miniplan:
    return get_or_404(
        db,
        Miniplan,
        miniplan_id,
        pfarrei_id=pfarrei_id,
        options=_planstand_optionen(),
        not_found_detail="Miniplan nicht gefunden",
    )


def schreibschutz_pruefen(miniplan: Miniplan) -> None:
    """Verhindert Änderungen an einem abgeschlossenen Miniplan. Der Plan muss erst über den
    Status-Endpunkt wieder auf `in_bearbeitung` gesetzt werden, bevor er editierbar ist - so
    bleibt ein veröffentlichter (und ggf. schon als PDF verteilter) Plan stabil."""
    if miniplan.status == MiniplanStatus.ABGESCHLOSSEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der Miniplan ist abgeschlossen. Bitte zuerst wieder öffnen.",
        )


def _get_zuweisung_or_404(
    miniplan_id: int, zuweisung_id: int, db: Session
) -> DienstbedarfZuweisung:
    return get_or_404(
        db,
        DienstbedarfZuweisung,
        zuweisung_id,
        joins=[
            (Dienstbedarf, DienstbedarfZuweisung.dienstbedarf_id == Dienstbedarf.id),
            (Gottesdienst, Dienstbedarf.gottesdienst_id == Gottesdienst.id),
        ],
        filters=[Gottesdienst.miniplan_id == miniplan_id],
        not_found_detail="Zuweisung nicht gefunden",
    )


def _render_pdf_oder_422(pfarrei_name: str, planstand: MiniplanVorschauIn) -> bytes:
    try:
        return render_miniplan_pdf(pfarrei_name, planstand)
    except TypstCompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"fehler": exc.errors},
        ) from exc


@router.get("", response_model=list[MiniplanListeOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[MiniplanListeOut]:
    # Übersichtsliste braucht nur Eckdaten + Gottesdienst-Anzahl, nicht den kompletten
    # verschachtelten Planstand - ein gezählter Join statt `_get_miniplan_or_404`s Eager-Loading
    # erspart die teuren selectinload-Ketten für jeden je angelegten Miniplan der Pfarrei.
    zeilen = (
        db.query(Miniplan, func.count(Gottesdienst.id))
        .outerjoin(Gottesdienst, Gottesdienst.miniplan_id == Miniplan.id)
        .filter(Miniplan.pfarrei_id == pfarrei_id)
        .group_by(Miniplan.id)
        .order_by(Miniplan.jahr.desc(), Miniplan.monat.desc())
        .all()
    )
    return [
        MiniplanListeOut(
            id=miniplan.id,
            pfarrei_id=miniplan.pfarrei_id,
            monat=miniplan.monat,
            jahr=miniplan.jahr,
            status=miniplan.status,
            gottesdienste_anzahl=anzahl,
        )
        for miniplan, anzahl in zeilen
    ]


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
    schreibschutz_pruefen(miniplan)
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


@router.put("/{miniplan_id}/zuteilung-einstellungen", response_model=MiniplanOut)
def zuteilung_einstellungen_setzen(
    pfarrei_id: int,
    miniplan_id: int,
    daten: ZuteilungEinstellungen,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    miniplan.fairness_gewicht = daten.fairness_gewicht
    miniplan.mindestabstand_tage = daten.mindestabstand_tage
    miniplan.mixing_gewicht = daten.mixing_gewicht
    miniplan.wiederholung_gewicht = daten.wiederholung_gewicht
    miniplan.max_einsaetze_standard = daten.max_einsaetze_standard
    miniplan.ignoriere_max_einsaetze = daten.ignoriere_max_einsaetze
    miniplan.ignoriere_gruppen_mindestanzahl = daten.ignoriere_gruppen_mindestanzahl
    miniplan.ignoriere_verfuegbarkeit = daten.ignoriere_verfuegbarkeit
    db.commit()
    db.refresh(miniplan)
    return miniplan


@router.put("/{miniplan_id}/minis/{mini_id}/limit", response_model=MiniplanOut)
def mini_limit_setzen(
    pfarrei_id: int,
    miniplan_id: int,
    mini_id: int,
    daten: MiniLimitIn,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    """Überschreibt für diesen einen Mini das Einsatz-Limit nur innerhalb dieses Miniplans -
    `max_einsaetze=None` hebt jedes Limit für ihn explizit auf, unabhängig von
    `Mini.max_einsaetze_pro_monat`/`Miniplan.max_einsaetze_standard` (siehe
    services/zuteilung.py)."""
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    get_or_404(db, Mini, mini_id, pfarrei_id=pfarrei_id)
    limit = (
        db.query(MiniMiniplanLimit)
        .filter(MiniMiniplanLimit.miniplan_id == miniplan_id, MiniMiniplanLimit.mini_id == mini_id)
        .first()
    )
    if limit is None:
        db.add(
            MiniMiniplanLimit(
                miniplan_id=miniplan_id, mini_id=mini_id, max_einsaetze=daten.max_einsaetze
            )
        )
    else:
        limit.max_einsaetze = daten.max_einsaetze
    db.commit()
    db.refresh(miniplan)
    return miniplan


@router.delete("/{miniplan_id}/minis/{mini_id}/limit", response_model=MiniplanOut)
def mini_limit_entfernen(
    pfarrei_id: int,
    miniplan_id: int,
    mini_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    """Entfernt die Ausnahme wieder - der Mini fällt für diesen Plan zurück auf
    `Mini.max_einsaetze_pro_monat`/`Miniplan.max_einsaetze_standard`."""
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    limit = (
        db.query(MiniMiniplanLimit)
        .filter(MiniMiniplanLimit.miniplan_id == miniplan_id, MiniMiniplanLimit.mini_id == mini_id)
        .first()
    )
    if limit is not None:
        db.delete(limit)
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
    schreibschutz_pruefen(miniplan)
    miniplan_operations.fuellen_miniplan(db, pfarrei_id, miniplan)
    db.refresh(miniplan)
    return miniplan


@router.post("/{miniplan_id}/zuweisungen/tauschen", response_model=MiniplanOut)
def zuweisungen_tauschen(
    pfarrei_id: int,
    miniplan_id: int,
    daten: ZuweisungTauschenIn,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    if daten.zuweisung_id_a == daten.zuweisung_id_b:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Zuweisungen müssen unterschiedlich sein",
        )
    zuweisung_a = _get_zuweisung_or_404(miniplan_id, daten.zuweisung_id_a, db)
    zuweisung_b = _get_zuweisung_or_404(miniplan_id, daten.zuweisung_id_b, db)

    try:
        miniplan_operations.zuweisungen_tauschen(db, zuweisung_a, zuweisung_b)
    except miniplan_operations.MiniBereitsEingeteiltFehler:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der Mini ist in diesem Gottesdienst bereits eingeteilt",
        ) from None
    db.refresh(miniplan)
    return miniplan


@router.post("/{miniplan_id}/zuweisungen/leeren", response_model=MiniplanOut)
def zuweisungen_leeren(
    pfarrei_id: int,
    miniplan_id: int,
    daten: ZuweisungenLeerenIn,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    """Entfernt automatisch (nicht fixiert) zugewiesene Minis - je nach Body für den ganzen Plan,
    einen Gottesdienst oder einen einzelnen Dienstbedarf. Manuell fixierte Zuweisungen bleiben."""
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    miniplan_operations.zuweisungen_leeren(
        db, miniplan, daten.gottesdienst_id, daten.dienstbedarf_id
    )
    db.refresh(miniplan)
    return miniplan


@router.post("/{miniplan_id}/zuweisungen/{zuweisung_id}/fixierung", response_model=MiniplanOut)
def zuweisung_fixierung_setzen(
    pfarrei_id: int,
    miniplan_id: int,
    zuweisung_id: int,
    daten: ZuweisungFixierungIn,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    zuweisung = _get_zuweisung_or_404(miniplan_id, zuweisung_id, db)
    zuweisung.manuell_fixiert = daten.manuell_fixiert
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
    pdf_bytes = _render_pdf_oder_422(pfarrei.name, miniplan_zu_vorschau(miniplan))
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
    pdf_bytes = _render_pdf_oder_422(pfarrei.name, daten)
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
    schreibschutz_pruefen(miniplan)
    db.delete(miniplan)
    db.commit()
