from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.miniplaene import schreibschutz_pruefen
from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.dienst_typ import DienstTyp
from app.models.dienstbedarf import (
    Dienstbedarf,
    DienstbedarfGruppenAnforderung,
    DienstbedarfZuweisung,
)
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.nutzer import PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.schemas.dienstbedarf import DienstbedarfIn
from app.schemas.gottesdienst import GottesdienstIn, GottesdienstOut
from app.services.filtertag_validation import unbekannte_filtertag_keys

router = APIRouter(
    prefix="/api/pfarreien/{pfarrei_id}/miniplaene/{miniplan_id}/gottesdienste",
    tags=["gottesdienste"],
)
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


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


def _get_gottesdienst_or_404(miniplan_id: int, gottesdienst_id: int, db: Session) -> Gottesdienst:
    gottesdienst = (
        db.query(Gottesdienst)
        .filter(Gottesdienst.id == gottesdienst_id, Gottesdienst.miniplan_id == miniplan_id)
        .first()
    )
    if gottesdienst is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gottesdienst nicht gefunden"
        )
    return gottesdienst


def _dienstbedarf_bauen(
    pfarrei_id: int, eintraege: list[DienstbedarfIn], db: Session
) -> list[Dienstbedarf]:
    dienst_typ_ids = {e.dienst_typ_id for e in eintraege if e.dienst_typ_id is not None}
    dienst_typen_by_id = {
        dt.id: dt
        for dt in db.query(DienstTyp)
        .filter(DienstTyp.id.in_(dienst_typ_ids), DienstTyp.pfarrei_id == pfarrei_id)
        .all()
    }
    if len(dienst_typen_by_id) != len(dienst_typ_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ein oder mehrere Dienst-Typen gehören nicht zu dieser Pfarrei",
        )

    gruppen_ids = {
        a.gruppe_id for e in eintraege for a in e.gruppen_anforderungen
    }
    gruppen_by_id = {
        g.id: g
        for g in db.query(Gruppe)
        .filter(Gruppe.id.in_(gruppen_ids), Gruppe.pfarrei_id == pfarrei_id)
        .all()
    }
    if len(gruppen_by_id) != len(gruppen_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Eine oder mehrere Gruppen gehören nicht zu dieser Pfarrei",
        )

    mini_ids = {
        mini_id for e in eintraege for mini_id in (*e.fixierte_mini_ids, *e.auto_mini_ids)
    }
    minis_by_id = {
        m.id: m
        for m in db.query(Mini).filter(Mini.id.in_(mini_ids), Mini.pfarrei_id == pfarrei_id).all()
    }
    if len(minis_by_id) != len(mini_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ein oder mehrere Minis gehören nicht zu dieser Pfarrei",
        )

    alle_filtertags = {tag for e in eintraege for tag in e.erforderliche_filtertags}
    unbekannt = unbekannte_filtertag_keys(pfarrei_id, alle_filtertags, db)
    if unbekannt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unbekannte Filtertags: {', '.join(sorted(unbekannt))}",
        )

    dienstbedarf_liste = []
    for eintrag in eintraege:
        dienstbedarf_liste.append(
            Dienstbedarf(
                dienst_typ_id=eintrag.dienst_typ_id,
                name=eintrag.name,
                anzahl=eintrag.anzahl,
                erforderliche_filtertags=eintrag.erforderliche_filtertags,
                zeige_label=eintrag.zeige_label,
                gruppen_anforderungen=[
                    DienstbedarfGruppenAnforderung(
                        gruppe_id=a.gruppe_id,
                        mindest_anzahl=a.mindest_anzahl,
                        gruppe=gruppen_by_id[a.gruppe_id],
                    )
                    for a in eintrag.gruppen_anforderungen
                ],
                zuweisungen=[
                    DienstbedarfZuweisung(
                        mini_id=mini_id, mini=minis_by_id[mini_id], manuell_fixiert=True
                    )
                    for mini_id in eintrag.fixierte_mini_ids
                ]
                + [
                    DienstbedarfZuweisung(
                        mini_id=mini_id, mini=minis_by_id[mini_id], manuell_fixiert=False
                    )
                    for mini_id in eintrag.auto_mini_ids
                ],
            )
        )
    return dienstbedarf_liste


@router.post("", response_model=GottesdienstOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    miniplan_id: int,
    daten: GottesdienstIn,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Gottesdienst:
    schreibschutz_pruefen(_get_miniplan_or_404(pfarrei_id, miniplan_id, db))
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan_id,
        datum=daten.datum,
        uhrzeit=daten.uhrzeit,
        name=daten.name,
        notiz=daten.notiz,
        dienstbedarf=_dienstbedarf_bauen(pfarrei_id, daten.dienstbedarf, db),
    )
    db.add(gottesdienst)
    db.commit()
    db.refresh(gottesdienst)
    return gottesdienst


@router.put("/{gottesdienst_id}", response_model=GottesdienstOut)
def bearbeiten(
    pfarrei_id: int,
    miniplan_id: int,
    gottesdienst_id: int,
    daten: GottesdienstIn,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> Gottesdienst:
    schreibschutz_pruefen(_get_miniplan_or_404(pfarrei_id, miniplan_id, db))
    gottesdienst = _get_gottesdienst_or_404(miniplan_id, gottesdienst_id, db)
    gottesdienst.datum = daten.datum
    gottesdienst.uhrzeit = daten.uhrzeit
    gottesdienst.name = daten.name
    gottesdienst.notiz = daten.notiz
    gottesdienst.dienstbedarf = _dienstbedarf_bauen(pfarrei_id, daten.dienstbedarf, db)
    db.commit()
    db.refresh(gottesdienst)
    return gottesdienst


@router.delete("/{gottesdienst_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(
    pfarrei_id: int,
    miniplan_id: int,
    gottesdienst_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    schreibschutz_pruefen(_get_miniplan_or_404(pfarrei_id, miniplan_id, db))
    gottesdienst = _get_gottesdienst_or_404(miniplan_id, gottesdienst_id, db)
    db.delete(gottesdienst)
    db.commit()
