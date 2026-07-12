import time
from datetime import date, datetime

import httpx
from sqlalchemy.orm import Session

from app.models.ferienzeitraum import Ferienzeitraum
from app.models.pfarrei import Pfarrei

FERIEN_API_URL = "https://ferien-api.de/api/v1/holidays/{bundesland}/{jahr}"
_CACHE_TTL_SECONDS = 60 * 60 * 24

# Cache pro (Bundesland, Jahr) für erfolgreiche Antworten der externen Ferien-Quelle, damit
# mehrfache Sync-Aufrufe (mehrere Pfarreien, wiederholtes "Jetzt aktualisieren") ferien-api.de
# nicht unnötig oft anfragen. Wirkt nur innerhalb eines Prozesses, siehe app/rate_limit.py für
# dasselbe Muster/dieselbe Einschränkung.
_cache: dict[tuple[str, int], tuple[float, list[dict]]] = {}


class FerienSyncFehler(Exception):
    """Wird geworfen, wenn die externe Ferien-Quelle nicht erreichbar ist."""


def _schuljahr(datum: date) -> str:
    if datum.month >= 9:
        return f"{datum.year}/{datum.year + 1}"
    return f"{datum.year - 1}/{datum.year}"


def _ferien_fuer_jahr(bundesland: str, jahr: int, client: httpx.Client) -> list[dict]:
    cache_key = (bundesland, jahr)
    gecached = _cache.get(cache_key)
    if gecached is not None:
        gecacht_am, daten = gecached
        if time.monotonic() - gecacht_am < _CACHE_TTL_SECONDS:
            return daten

    response = client.get(FERIEN_API_URL.format(bundesland=bundesland, jahr=jahr))
    response.raise_for_status()
    daten = response.json()
    _cache[cache_key] = (time.monotonic(), daten)
    return daten


def _abgedeckte_jahre(db: Session, pfarrei_id: int) -> set[int]:
    """Jahre, für die bereits (mindestens ein) Ferienzeitraum gespeichert ist - anhand des
    Startdatums, analog zu `_schuljahr`/der bestehenden Jahres-Logik der Aufrufer."""
    return {
        start_datum.year
        for (start_datum,) in db.query(Ferienzeitraum.start_datum).filter(
            Ferienzeitraum.pfarrei_id == pfarrei_id
        )
    }


def _hole_rohdaten(pfarrei: Pfarrei, jahre: set[int]) -> list[dict]:
    try:
        with httpx.Client(timeout=10.0) as client:
            return [
                eintrag
                for jahr in jahre
                for eintrag in _ferien_fuer_jahr(pfarrei.bundesland.value, jahr, client)
            ]
    except httpx.HTTPError as exc:
        raise FerienSyncFehler(
            "Ferien-Kalender konnte nicht abgerufen werden, bestehende Daten bleiben erhalten"
        ) from exc


def _als_zeitraeume(pfarrei: Pfarrei, rohdaten: list[dict]) -> list[Ferienzeitraum]:
    zeitraeume = []
    for eintrag in rohdaten:
        start_datum = datetime.strptime(eintrag["start"], "%Y-%m-%d").date()
        end_datum = datetime.strptime(eintrag["end"], "%Y-%m-%d").date()
        zeitraeume.append(
            Ferienzeitraum(
                pfarrei_id=pfarrei.id,
                name=eintrag["name"],
                start_datum=start_datum,
                end_datum=end_datum,
                schuljahr=_schuljahr(start_datum),
            )
        )
    return zeitraeume


def sync_ferien_falls_fehlend(
    pfarrei: Pfarrei, db: Session, jahre: set[int]
) -> list[Ferienzeitraum]:
    """Ergänzt (statt zu ersetzen) nur die Jahre, die noch nicht gespeichert sind - für
    automatische, unaufdringliche Hintergrund-Syncs (z.B. beim Öffnen eines Datumsfelds). Anders
    als `sync_ferien` (voller Neuabgleich für den manuellen "Aktualisieren"-Button) werden bereits
    gespeicherte andere Jahre dabei nie angetastet."""
    fehlend = jahre - _abgedeckte_jahre(db, pfarrei.id)
    if fehlend:
        rohdaten = _hole_rohdaten(pfarrei, fehlend)
        db.add_all(_als_zeitraeume(pfarrei, rohdaten))
        db.commit()
    return (
        db.query(Ferienzeitraum)
        .filter(Ferienzeitraum.pfarrei_id == pfarrei.id)
        .order_by(Ferienzeitraum.start_datum)
        .all()
    )


def sync_ferien(
    pfarrei: Pfarrei, db: Session, jahre: set[int] | None = None
) -> list[Ferienzeitraum]:
    if jahre is None:
        heute = date.today()
        jahre = {heute.year, (heute.year + 1)}

    rohdaten = _hole_rohdaten(pfarrei, jahre)

    # Voller Neuabgleich (nicht auf die angefragten Jahre beschränkt): dies ist der manuelle
    # "Aktualisieren"-Pfad, der auch verwaiste/veraltete Einträge aus früheren Bundesland-Wechseln
    # aufräumen soll. Für einen additiven Sync einzelner fehlender Jahre siehe
    # `sync_ferien_falls_fehlend`.
    db.query(Ferienzeitraum).filter(Ferienzeitraum.pfarrei_id == pfarrei.id).delete()
    db.add_all(_als_zeitraeume(pfarrei, rohdaten))
    db.commit()
    return (
        db.query(Ferienzeitraum)
        .filter(Ferienzeitraum.pfarrei_id == pfarrei.id)
        .order_by(Ferienzeitraum.start_datum)
        .all()
    )
