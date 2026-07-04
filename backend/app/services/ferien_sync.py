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


def sync_ferien(pfarrei: Pfarrei, db: Session) -> list[Ferienzeitraum]:
    heute = date.today()
    jahre = {heute.year, (heute.year + 1)}

    try:
        with httpx.Client(timeout=10.0) as client:
            rohdaten = [
                eintrag
                for jahr in jahre
                for eintrag in _ferien_fuer_jahr(pfarrei.bundesland.value, jahr, client)
            ]
    except httpx.HTTPError as exc:
        raise FerienSyncFehler(
            "Ferien-Kalender konnte nicht abgerufen werden, bestehende Daten bleiben erhalten"
        ) from exc

    db.query(Ferienzeitraum).filter(Ferienzeitraum.pfarrei_id == pfarrei.id).delete()

    neue_eintraege = []
    for eintrag in rohdaten:
        start_datum = datetime.strptime(eintrag["start"], "%Y-%m-%d").date()
        end_datum = datetime.strptime(eintrag["end"], "%Y-%m-%d").date()
        neue_eintraege.append(
            Ferienzeitraum(
                pfarrei_id=pfarrei.id,
                name=eintrag["name"],
                start_datum=start_datum,
                end_datum=end_datum,
                schuljahr=_schuljahr(start_datum),
            )
        )
    db.add_all(neue_eintraege)
    db.commit()
    return (
        db.query(Ferienzeitraum)
        .filter(Ferienzeitraum.pfarrei_id == pfarrei.id)
        .order_by(Ferienzeitraum.start_datum)
        .all()
    )
