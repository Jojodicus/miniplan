"""Erzeugt Beispieldaten (Minis + ein Miniplan mit Gottesdiensten) für eine Pfarrei, damit man
lokal (siehe scripts/run-local.sh) direkt mit einem gefüllten Bestand statt einer leeren
Stammdaten-Pfarrei herumklicken kann. Setzt voraus, dass die Pfarrei bereits über
seed_default_stammdaten() ihre Gruppen/Filtertags/DienstTypen hat."""

from datetime import date, time

from sqlalchemy.orm import Session

from app.models.dienst_typ import DienstTyp
from app.models.dienstbedarf import Dienstbedarf, DienstbedarfGruppenAnforderung
from app.models.filtertag import Filtertag
from app.models.gottesdienst import Gottesdienst
from app.models.gruppe import Gruppe
from app.models.mini import Mini
from app.models.miniplan import Miniplan
from app.models.pfarrei import Pfarrei

# (Name, Gruppe, Filtertag-Keys)
_MINI_DEFAULTS = [
    ("Anna Bauer", "Neu", ["grundschueler"]),
    ("Ben Fischer", "Neu", ["grundschueler"]),
    ("Clara Wolf", "Neu", ["grundschueler"]),
    ("David Meyer", "Neu", ["schueler"]),
    ("Emma Schulz", "Normal", ["schueler"]),
    ("Finn Becker", "Normal", ["schueler"]),
    ("Greta Hoffmann", "Normal", ["schueler"]),
    ("Hannah König", "Normal", ["schueler"]),
    ("Ida Richter", "Normal", ["schueler", "arbeiter"]),
    ("Jonas Klein", "Normal", ["arbeiter"]),
    ("Karla Neumann", "Obermini", ["schueler"]),
    ("Leon Schwarz", "Obermini", ["arbeiter"]),
    ("Mia Zimmermann", "Obermini", ["arbeiter"]),
    ("Noah Braun", "Obermini", ["arbeiter"]),
    ("Olivia Krüger", "Obermini", ["arbeiter"]),
]

# (Datum, Uhrzeit, Name, DienstTyp-Name)
_GOTTESDIENST_DEFAULTS = [
    (date(2026, 7, 5), time(10, 0), None, "Sonntagsmesse"),
    (date(2026, 7, 8), time(18, 0), None, "Wochentagsmesse"),
    (date(2026, 7, 12), time(10, 0), None, "Sonntagsmesse"),
    (date(2026, 7, 19), time(10, 0), None, "Sonntagsmesse"),
    (date(2026, 7, 26), time(18, 0), "Patrozinium", "Weihrauch"),
]


def seed_demo_daten(db: Session, pfarrei: Pfarrei) -> None:
    gruppen = {
        gruppe.name: gruppe
        for gruppe in db.query(Gruppe).filter(Gruppe.pfarrei_id == pfarrei.id).all()
    }
    filtertags = {
        filtertag.key
        for filtertag in db.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei.id).all()
    }
    dienst_typen = {
        dienst_typ.name: dienst_typ
        for dienst_typ in db.query(DienstTyp).filter(DienstTyp.pfarrei_id == pfarrei.id).all()
    }

    for name, gruppen_name, mini_filtertags in _MINI_DEFAULTS:
        db.add(
            Mini(
                pfarrei_id=pfarrei.id,
                gruppe_id=gruppen[gruppen_name].id,
                name=name,
                filtertags=[key for key in mini_filtertags if key in filtertags],
            )
        )

    miniplan = Miniplan(pfarrei_id=pfarrei.id, monat=7, jahr=2026)
    db.add(miniplan)
    db.flush()

    for datum, uhrzeit, name, dienst_typ_name in _GOTTESDIENST_DEFAULTS:
        dienst_typ = dienst_typen[dienst_typ_name]
        gottesdienst = Gottesdienst(miniplan_id=miniplan.id, datum=datum, uhrzeit=uhrzeit, name=name)
        db.add(gottesdienst)
        db.flush()
        dienstbedarf = Dienstbedarf(
            gottesdienst_id=gottesdienst.id,
            dienst_typ_id=dienst_typ.id,
            anzahl=dienst_typ.standard_anzahl,
            zeige_label=dienst_typ.zeige_label,
        )
        db.add(dienstbedarf)
        db.flush()
        for anforderung in dienst_typ.gruppen_anforderungen:
            db.add(
                DienstbedarfGruppenAnforderung(
                    dienstbedarf_id=dienstbedarf.id,
                    gruppe_id=anforderung.gruppe_id,
                    mindest_anzahl=anforderung.mindest_anzahl,
                )
            )

    db.commit()
