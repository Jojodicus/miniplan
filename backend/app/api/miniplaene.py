import contextlib

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.dienstbedarf import (
    Dienstbedarf,
    DienstbedarfGruppenAnforderung,
    DienstbedarfZuweisung,
)
from app.models.gottesdienst import Gottesdienst
from app.models.miniplan import Miniplan, MiniplanStatus
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.dienstbedarf import (
    ZuweisungenLeerenIn,
    ZuweisungFixierungIn,
    ZuweisungTauschenIn,
)
from app.schemas.miniplan import (
    MiniplanCreate,
    MiniplanListeOut,
    MiniplanOut,
    MiniplanStatusUpdate,
    MiniplanUpdate,
    ZuteilungEinstellungen,
)
from app.schemas.miniplan_vorschau import MiniplanVorschauIn, miniplan_zu_vorschau
from app.services.ferien_sync import FerienSyncFehler, sync_ferien_falls_fehlend
from app.services.typst_render import TypstCompileError, render_miniplan_pdf
from app.services.zuteilung import zuteilung_vorschlagen

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/miniplaene", tags=["miniplaene"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)
require_lesend = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER, PfarreiRolle.BETRACHTER)


def _mit_geladenem_planstand(query):
    """Lädt die komplette Gottesdienst/Dienstbedarf/Zuweisungs-Kette per selectinload statt der
    SQLAlchemy-Default-Lazy-Loads - sonst löst die Ausgabe der verschachtelten Response-Schemas
    (MiniplanOut) für jede Zeile eine eigene Query aus (N+1), was v.a. die alle 500ms aufgerufene
    Live-Vorschau spürbar verlangsamt."""
    return query.options(
        selectinload(Miniplan.gottesdienste).options(
            selectinload(Gottesdienst.dienstbedarf).options(
                selectinload(Dienstbedarf.dienst_typ),
                selectinload(Dienstbedarf.gruppen_anforderungen).selectinload(
                    DienstbedarfGruppenAnforderung.gruppe
                ),
                selectinload(Dienstbedarf.zuweisungen).selectinload(DienstbedarfZuweisung.mini),
            )
        )
    )


def _get_miniplan_or_404(pfarrei_id: int, miniplan_id: int, db: Session) -> Miniplan:
    miniplan = (
        _mit_geladenem_planstand(db.query(Miniplan))
        .filter(Miniplan.id == miniplan_id, Miniplan.pfarrei_id == pfarrei_id)
        .first()
    )
    if miniplan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniplan nicht gefunden")
    return miniplan


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
    zuweisung = (
        db.query(DienstbedarfZuweisung)
        .join(Dienstbedarf, DienstbedarfZuweisung.dienstbedarf_id == Dienstbedarf.id)
        .join(Gottesdienst, Dienstbedarf.gottesdienst_id == Gottesdienst.id)
        .filter(DienstbedarfZuweisung.id == zuweisung_id, Gottesdienst.miniplan_id == miniplan_id)
        .first()
    )
    if zuweisung is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Zuweisung nicht gefunden"
        )
    return zuweisung


def _render_pdf_oder_422(pfarrei_name: str, planstand: MiniplanVorschauIn) -> bytes:
    try:
        return render_miniplan_pdf(pfarrei_name, planstand)
    except TypstCompileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"fehler": exc.errors},
        ) from exc


def _mini_bereits_im_gottesdienst(
    db: Session, gottesdienst_id: int, mini_id: int, ausser_zuweisung_ids: set[int]
) -> bool:
    return (
        db.query(DienstbedarfZuweisung)
        .join(Dienstbedarf, DienstbedarfZuweisung.dienstbedarf_id == Dienstbedarf.id)
        .filter(
            Dienstbedarf.gottesdienst_id == gottesdienst_id,
            DienstbedarfZuweisung.mini_id == mini_id,
            DienstbedarfZuweisung.id.notin_(ausser_zuweisung_ids),
        )
        .first()
        is not None
    )


@router.get("", response_model=list[MiniplanListeOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[MiniplanListeOut]:
    # Übersichtsliste braucht nur Eckdaten + Gottesdienst-Anzahl, nicht den kompletten
    # verschachtelten Planstand - ein gezählter Join statt `_mit_geladenem_planstand` erspart die
    # teuren selectinload-Ketten für jeden je angelegten Miniplan der Pfarrei.
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
    db.commit()
    db.refresh(miniplan)
    return miniplan


@router.post("/{miniplan_id}/fuellen", response_model=MiniplanOut)
def fuellen(
    pfarrei_id: int,
    miniplan_id: int,
    db: Session = Depends(get_db),
    pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Miniplan:
    miniplan = _get_miniplan_or_404(pfarrei_id, miniplan_id, db)
    schreibschutz_pruefen(miniplan)
    # Best-effort, nur additiv für tatsächlich fehlende Jahre (statt eines vollen Neuabgleichs bei
    # jedem einzelnen Füllen-Lauf): schlägt die externe Ferien-Quelle fehl, bleiben bestehende
    # Ferienzeiten erhalten, das Füllen soll dadurch nicht scheitern. Ein voller `sync_ferien` bei
    # jedem Füllen hätte sonst unnötig oft die externe Quelle angefragt - je nach Nutzungsmuster
    # oft genug, um deren Rate-Limit zu erschöpfen (siehe `ferien_sync._rate_limited_until`) und
    # sogar den manuellen "Aktualisieren"-Button mitzublockieren. Jahre aus dem Miniplan
    # selbst statt dem heutigen Datum, damit auch mit Vorlauf geplante Monate (z.B. kurz vor
    # Schuljahresbeginn) aktuelle Ferienzeiten für ihr eigenes Jahr bekommen.
    with contextlib.suppress(FerienSyncFehler):
        sync_ferien_falls_fehlend(pfarrei, db, jahre={miniplan.jahr, miniplan.jahr + 1})
    vorschlag = zuteilung_vorschlagen(db, pfarrei_id, miniplan)
    # Erst alle nicht fixierten Zuweisungen löschen und flushen, bevor die neu vorgeschlagenen
    # eingefügt werden: bei einem erneuten Füllen-Lauf kann derselbe Mini wieder demselben
    # Dienstbedarf zugewiesen werden (z.B. weil er der einzige passende Kandidat bleibt) - ohne
    # den Flush dazwischen könnte SQLAlchemy die neue Zeile einfügen, bevor die alte (gleiche
    # `dienstbedarf_id`+`mini_id`) gelöscht ist, und den Unique-Constraint verletzen.
    for gottesdienst in miniplan.gottesdienste:
        for bedarf in gottesdienst.dienstbedarf:
            for zuweisung in bedarf.zuweisungen:
                if not zuweisung.manuell_fixiert:
                    db.delete(zuweisung)
    db.flush()
    for gottesdienst in miniplan.gottesdienste:
        for bedarf in gottesdienst.dienstbedarf:
            for mini_id in vorschlag.get(bedarf.id, []):
                db.add(
                    DienstbedarfZuweisung(
                        dienstbedarf_id=bedarf.id, mini_id=mini_id, manuell_fixiert=False
                    )
                )
    db.commit()
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

    gottesdienst_a_id = zuweisung_a.dienstbedarf.gottesdienst_id
    gottesdienst_b_id = zuweisung_b.dienstbedarf.gottesdienst_id
    # Beide beteiligten Zuweisungen ausschließen, nicht nur die jeweils eigene: gehören beide zum
    # selben Gottesdienst (Tausch über zwei Dienst-Typen desselben Termins hinweg), wäre sonst die
    # andere Zuweisung selbst - die ja gerade den gesuchten Mini noch trägt, aber gleich den
    # anderen bekommt - ein fälschlicher "bereits eingeteilt"-Treffer.
    ausgeschlossen = {zuweisung_a.id, zuweisung_b.id}
    if _mini_bereits_im_gottesdienst(db, gottesdienst_a_id, zuweisung_b.mini_id, ausgeschlossen):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der Mini ist in diesem Gottesdienst bereits eingeteilt",
        )
    if _mini_bereits_im_gottesdienst(db, gottesdienst_b_id, zuweisung_a.mini_id, ausgeschlossen):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Der Mini ist in diesem Gottesdienst bereits eingeteilt",
        )

    # Nicht per In-Place-Update tauschen: der Unique-Constraint (dienstbedarf_id, mini_id) kann
    # dabei transient verletzt werden, wenn beide Zuweisungen zum selben Dienstbedarf gehören.
    # Löschen + Neuanlegen in einem Flush umgeht das zuverlässig. Die Fixierung bleibt an der
    # Stelle (Zeile) hängen, nicht am Mini - wer wohin gehört, tauscht, wer davon fixiert war
    # bleibt es an der jeweiligen Stelle.
    dienstbedarf_a_id, mini_b_id, fixiert_a = (
        zuweisung_a.dienstbedarf_id,
        zuweisung_b.mini_id,
        zuweisung_a.manuell_fixiert,
    )
    dienstbedarf_b_id, mini_a_id, fixiert_b = (
        zuweisung_b.dienstbedarf_id,
        zuweisung_a.mini_id,
        zuweisung_b.manuell_fixiert,
    )
    db.delete(zuweisung_a)
    db.delete(zuweisung_b)
    db.flush()
    db.add(
        DienstbedarfZuweisung(
            dienstbedarf_id=dienstbedarf_a_id, mini_id=mini_b_id, manuell_fixiert=fixiert_a
        )
    )
    db.add(
        DienstbedarfZuweisung(
            dienstbedarf_id=dienstbedarf_b_id, mini_id=mini_a_id, manuell_fixiert=fixiert_b
        )
    )
    db.commit()
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
    for gottesdienst in miniplan.gottesdienste:
        if daten.gottesdienst_id is not None and gottesdienst.id != daten.gottesdienst_id:
            continue
        for bedarf in gottesdienst.dienstbedarf:
            if daten.dienstbedarf_id is not None and bedarf.id != daten.dienstbedarf_id:
                continue
            for zuweisung in bedarf.zuweisungen:
                if not zuweisung.manuell_fixiert:
                    db.delete(zuweisung)
    db.commit()
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
