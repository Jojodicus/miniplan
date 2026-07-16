"""Orchestrierung der Zuteilungs-Mutationen ("Füllen", Tauschen, Leeren) für einen Miniplan.

Früher lag diese Logik direkt in den Route-Handlern von `api/miniplaene.py`. Sie ist bewusst als
eigener Service ausgelagert, damit die Handler dünn bleiben (Request parsen -> Service aufrufen ->
Response serialisieren, siehe CLAUDE.md-Konvention zur Schichtentrennung). Services werfen hier
- wie an anderer Stelle bereits mit `FerienSyncFehler` vorgemacht - eigene Fehlerklassen statt
`HTTPException`; die Übersetzung in einen HTTP-Status bleibt Sache der Router.
"""

import contextlib

from sqlalchemy.orm import Session

from app.models.dienstbedarf import Dienstbedarf, DienstbedarfZuweisung
from app.models.miniplan import Miniplan
from app.models.pfarrei import Pfarrei
from app.services.ferien_sync import FerienSyncFehler, sync_ferien_falls_fehlend
from app.services.zuteilung import zuteilung_vorschlagen


class MiniBereitsEingeteiltFehler(Exception):
    """Wird geworfen, wenn ein Tausch einen Mini doppelt in denselben Gottesdienst einteilen
    würde (der Mini trägt dort - abgesehen von den beiden am Tausch beteiligten Zeilen - bereits
    eine andere Zuweisung)."""


def fuellen_miniplan(db: Session, pfarrei_id: int, miniplan: Miniplan) -> None:
    """Wendet einen frischen Zuteilungsvorschlag (`zuteilung.zuteilung_vorschlagen`) auf
    `miniplan` an: alle nicht manuell fixierten Zuweisungen werden ersetzt (voller Neu-Lauf über
    alle freien Stellen, nicht nur über seit dem letzten Lauf leere). Committet selbst."""
    pfarrei = db.get(Pfarrei, pfarrei_id)
    # Best-effort, nur additiv für tatsächlich fehlende Jahre (statt eines vollen Neuabgleichs bei
    # jedem einzelnen Füllen-Lauf): schlägt die externe Ferien-Quelle fehl, bleiben bestehende
    # Ferienzeiten erhalten, das Füllen soll dadurch nicht scheitern. Ein voller `sync_ferien` bei
    # jedem Füllen hätte sonst unnötig oft die externe Quelle angefragt - je nach Nutzungsmuster
    # oft genug, um deren Rate-Limit zu erschöpfen (siehe `ferien_sync._rate_limited_until`) und
    # sogar den manuellen "Aktualisieren"-Button mitzublockieren. Jahre aus dem Miniplan
    # selbst statt dem heutigen Datum, damit auch mit Vorlauf geplante Monate (z.B. kurz vor
    # Schuljahresbeginn) aktuelle Ferienzeiten für ihr eigenes Jahr bekommen.
    if pfarrei is not None:
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


def zuweisungen_tauschen(
    db: Session,
    zuweisung_a: DienstbedarfZuweisung,
    zuweisung_b: DienstbedarfZuweisung,
) -> None:
    """Tauscht die Minis zweier `DienstbedarfZuweisung`-Zeilen (auch über verschiedene
    Gottesdienste/Dienstbedarf hinweg) - das `manuell_fixiert`-Flag bleibt dabei an der Zeile/
    Stelle hängen, nicht am Mini. Wirft `MiniBereitsEingeteiltFehler`, wenn der Tausch einen Mini
    doppelt in denselben Gottesdienst einteilen würde. Committet selbst."""
    gottesdienst_a_id = zuweisung_a.dienstbedarf.gottesdienst_id
    gottesdienst_b_id = zuweisung_b.dienstbedarf.gottesdienst_id
    # Beide beteiligten Zuweisungen ausschließen, nicht nur die jeweils eigene: gehören beide zum
    # selben Gottesdienst (Tausch über zwei Dienst-Typen desselben Termins hinweg), wäre sonst die
    # andere Zuweisung selbst - die ja gerade den gesuchten Mini noch trägt, aber gleich den
    # anderen bekommt - ein fälschlicher "bereits eingeteilt"-Treffer.
    ausgeschlossen = {zuweisung_a.id, zuweisung_b.id}
    if _mini_bereits_im_gottesdienst(db, gottesdienst_a_id, zuweisung_b.mini_id, ausgeschlossen):
        raise MiniBereitsEingeteiltFehler()
    if _mini_bereits_im_gottesdienst(db, gottesdienst_b_id, zuweisung_a.mini_id, ausgeschlossen):
        raise MiniBereitsEingeteiltFehler()

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


def zuweisungen_leeren(
    db: Session,
    miniplan: Miniplan,
    gottesdienst_id: int | None,
    dienstbedarf_id: int | None,
) -> None:
    """Entfernt automatisch (nicht fixiert) zugewiesene Minis - ohne Einschränkung planweit, mit
    `gottesdienst_id`/`dienstbedarf_id` gezielt für einen Gottesdienst bzw. Dienstbedarf. Manuell
    fixierte Zuweisungen bleiben unangetastet. Committet selbst."""
    for gottesdienst in miniplan.gottesdienste:
        if gottesdienst_id is not None and gottesdienst.id != gottesdienst_id:
            continue
        for bedarf in gottesdienst.dienstbedarf:
            if dienstbedarf_id is not None and bedarf.id != dienstbedarf_id:
                continue
            for zuweisung in bedarf.zuweisungen:
                if not zuweisung.manuell_fixiert:
                    db.delete(zuweisung)
    db.commit()
