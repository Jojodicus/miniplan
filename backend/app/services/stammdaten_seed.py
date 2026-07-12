"""Erzeugt sinnvolle Default-Stammdaten für eine frisch angelegte Pfarrei, damit nicht jede
neue Pfarrei manuell über die API mit Gruppen/DienstTypen/Filtertags befüllt werden muss."""

from datetime import time

from sqlalchemy.orm import Session

from app.models.dienst_typ import DienstTyp, DienstTypGruppenAnforderung
from app.models.filtertag import Filtertag
from app.models.filtertag_blocker import FiltertagBlocker
from app.models.gruppe import Gruppe
from app.models.pfarrei import Pfarrei

# (key, label, ist_schueler_artig, block_start, block_ende) - Blocker gelten Montag-Freitag.
_FILTERTAG_DEFAULTS = [
    ("grundschueler", "Grundschüler", True, time(8, 0), time(13, 0)),
    ("schueler", "Schüler", True, time(8, 0), time(18, 0)),
    ("arbeiter", "Arbeiter", False, time(0, 0), time(23, 59)),
]

_WOCHENTAGE_MO_FR = range(5)


def seed_default_stammdaten(db: Session, pfarrei: Pfarrei) -> None:
    for key, label, ist_schueler_artig, start, ende in _FILTERTAG_DEFAULTS:
        filtertag = Filtertag(
            pfarrei_id=pfarrei.id,
            key=key,
            label=label,
            ist_schueler_artig=ist_schueler_artig,
        )
        db.add(filtertag)
        db.flush()
        for wochentag in _WOCHENTAGE_MO_FR:
            db.add(
                FiltertagBlocker(
                    pfarrei_id=pfarrei.id,
                    filtertag_id=filtertag.id,
                    wochentag=wochentag,
                    start_zeit=start,
                    end_zeit=ende,
                )
            )

    gruppen = {name: Gruppe(pfarrei_id=pfarrei.id, name=name) for name in ("Neu", "Normal", "Obermini")}
    for gruppe in gruppen.values():
        db.add(gruppe)
    db.flush()

    sonntagsmesse = DienstTyp(
        pfarrei_id=pfarrei.id, name="Sonntagsmesse", standard_anzahl=4, zeige_label=False
    )
    db.add(sonntagsmesse)
    db.flush()
    db.add(
        DienstTypGruppenAnforderung(
            dienst_typ_id=sonntagsmesse.id, gruppe_id=gruppen["Obermini"].id, mindest_anzahl=1
        )
    )

    weihrauch = DienstTyp(
        pfarrei_id=pfarrei.id, name="Weihrauch", standard_anzahl=2, zeige_label=True
    )
    db.add(weihrauch)
    db.flush()
    db.add(
        DienstTypGruppenAnforderung(
            dienst_typ_id=weihrauch.id, gruppe_id=gruppen["Obermini"].id, mindest_anzahl=1
        )
    )

    wochentagsmesse = DienstTyp(
        pfarrei_id=pfarrei.id, name="Wochentagsmesse", standard_anzahl=3, zeige_label=False
    )
    db.add(wochentagsmesse)

    # Anzahl 0: reine Hinweiszeile ohne eigene Zuweisungen (z. B. "Alle Ministranten bitte
    # pünktlich da sein"), zeigt auf dem Plan nur den Namen statt einer Minis-Liste.
    alle_ministranten = DienstTyp(
        pfarrei_id=pfarrei.id, name="Alle Ministranten", standard_anzahl=0, zeige_label=True
    )
    db.add(alle_ministranten)

    db.commit()
