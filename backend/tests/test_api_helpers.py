"""Unit-Tests für den generischen `get_or_404`-Helfer (Issue #15) - direkt gegen die Funktion,
ohne den Umweg über HTTP-Endpunkte (die die einzelnen `_get_<Modell>_or_404`-Wrapper bereits
implizit über ihre eigenen Tests abdecken)."""

from datetime import date, time

import pytest
from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.orm import Session, selectinload

from app.api._helpers import get_or_404
from app.models.dienstbedarf import Dienstbedarf, DienstbedarfZuweisung
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.pfarrei import Pfarrei


def test_get_or_404_pfarrei_scoped_treffer(
    db_session: Session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    gefunden = get_or_404(db_session, Gruppe, gruppe.id, pfarrei_id=pfarrei.id)
    assert gefunden.id == gruppe.id


def test_get_or_404_pfarrei_scoped_unbekannte_id_404(
    db_session: Session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_or_404(db_session, Gruppe, 999999, pfarrei_id=pfarrei.id)
    assert exc_info.value.status_code == 404


def test_get_or_404_pfarrei_scoped_fremde_pfarrei_404(
    db_session: Session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    """Existiert zwar, gehört aber zu einer anderen Pfarrei - muss trotzdem 404 liefern, nicht die
    fremde Zeile zurückgeben."""
    andere_pfarrei = Pfarrei(name="Andere Pfarrei")
    db_session.add(andere_pfarrei)
    db_session.commit()
    db_session.refresh(andere_pfarrei)

    with pytest.raises(HTTPException) as exc_info:
        get_or_404(db_session, Gruppe, gruppe.id, pfarrei_id=andere_pfarrei.id)
    assert exc_info.value.status_code == 404


def test_get_or_404_unscoped_treffer(db_session: Session, pfarrei: Pfarrei) -> None:
    gefunden = get_or_404(db_session, Pfarrei, pfarrei.id)
    assert gefunden.id == pfarrei.id


def test_get_or_404_unscoped_unbekannte_id_404(db_session: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_or_404(db_session, Pfarrei, 999999)
    assert exc_info.value.status_code == 404


def test_get_or_404_custom_detail_text(db_session: Session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_or_404(db_session, Pfarrei, 999999, not_found_detail="Pfarrei nicht gefunden")
    assert exc_info.value.detail == "Pfarrei nicht gefunden"


def test_get_or_404_default_detail_nennt_modellnamen(db_session: Session) -> None:
    """Ohne explizites `not_found_detail` fällt der Helfer auf einen generischen, aber
    modellspezifischen Text zurück statt eines komplett generischen "Objekt nicht gefunden"."""
    with pytest.raises(HTTPException) as exc_info:
        get_or_404(db_session, Pfarrei, 999999)
    assert "Pfarrei" in exc_info.value.detail


def test_get_or_404_filters_scoped_ueber_andere_spalte(
    db_session: Session, pfarrei: Pfarrei
) -> None:
    """Deckt den Fall ab, in dem nicht über `pfarrei_id`, sondern über eine andere Spalte gescoped
    wird (wie `Gottesdienst` über `miniplan_id` in `api/gottesdienste.py`)."""
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=5, jahr=2030)
    andere_miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=6, jahr=2030)
    db_session.add_all([miniplan, andere_miniplan])
    db_session.commit()
    db_session.refresh(miniplan)
    db_session.refresh(andere_miniplan)

    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2030, 5, 3), uhrzeit=time(10, 0)
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(gottesdienst)

    gefunden = get_or_404(
        db_session, Gottesdienst, gottesdienst.id, filters=[Gottesdienst.miniplan_id == miniplan.id]
    )
    assert gefunden.id == gottesdienst.id

    with pytest.raises(HTTPException) as exc_info:
        get_or_404(
            db_session,
            Gottesdienst,
            gottesdienst.id,
            filters=[Gottesdienst.miniplan_id == andere_miniplan.id],
        )
    assert exc_info.value.status_code == 404


def test_get_or_404_joins_transitiver_scope(
    db_session: Session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    """Deckt den Join-basierten Scope ab (wie `DienstbedarfZuweisung` transitiv über
    `Dienstbedarf`/`Gottesdienst` bis zum `Miniplan` in `api/miniplaene._get_zuweisung_or_404`)."""
    mini = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Karl")
    db_session.add(mini)
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2030)
    andere_miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=8, jahr=2030)
    db_session.add_all([miniplan, andere_miniplan])
    db_session.commit()
    db_session.refresh(miniplan)
    db_session.refresh(andere_miniplan)

    bedarf = Dienstbedarf(
        name="Kreuz", anzahl=1, zuweisungen=[DienstbedarfZuweisung(mini_id=mini.id)]
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2030, 7, 5), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.refresh(gottesdienst)
    zuweisung = bedarf.zuweisungen[0]

    gefunden = get_or_404(
        db_session,
        DienstbedarfZuweisung,
        zuweisung.id,
        joins=[
            (Dienstbedarf, DienstbedarfZuweisung.dienstbedarf_id == Dienstbedarf.id),
            (Gottesdienst, Dienstbedarf.gottesdienst_id == Gottesdienst.id),
        ],
        filters=[Gottesdienst.miniplan_id == miniplan.id],
    )
    assert gefunden.id == zuweisung.id

    with pytest.raises(HTTPException):
        get_or_404(
            db_session,
            DienstbedarfZuweisung,
            zuweisung.id,
            joins=[
                (Dienstbedarf, DienstbedarfZuweisung.dienstbedarf_id == Dienstbedarf.id),
                (Gottesdienst, Dienstbedarf.gottesdienst_id == Gottesdienst.id),
            ],
            filters=[Gottesdienst.miniplan_id == andere_miniplan.id],
        )


def test_get_or_404_options_wendet_eager_loading_an(
    db_session: Session, pfarrei: Pfarrei, gruppe: Gruppe
) -> None:
    """Deckt den Eager-Loading-Hook ab, den `api.miniplaene._get_miniplan_or_404` braucht, um beim
    Laden des Planstands kein N+1 einzuführen: mit `options` ist die Relation nach dem Fetch
    bereits geladen (kein Lazy-Load mehr nötig)."""
    mini = Mini(pfarrei_id=pfarrei.id, gruppe_id=gruppe.id, name="Karl")
    db_session.add(mini)
    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=9, jahr=2030)
    db_session.add(miniplan)
    db_session.commit()
    db_session.refresh(miniplan)
    bedarf = Dienstbedarf(
        name="Kreuz", anzahl=1, zuweisungen=[DienstbedarfZuweisung(mini_id=mini.id)]
    )
    gottesdienst = Gottesdienst(
        miniplan_id=miniplan.id, datum=date(2030, 9, 1), uhrzeit=time(10, 0), dienstbedarf=[bedarf]
    )
    db_session.add(gottesdienst)
    db_session.commit()
    db_session.expire_all()

    ohne_eager_loading = get_or_404(db_session, Miniplan, miniplan.id)
    assert "gottesdienste" in inspect(ohne_eager_loading).unloaded

    db_session.expire_all()
    mit_eager_loading = get_or_404(
        db_session,
        Miniplan,
        miniplan.id,
        options=(selectinload(Miniplan.gottesdienste),),
    )
    assert "gottesdienste" not in inspect(mit_eager_loading).unloaded
