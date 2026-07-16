import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ferienzeitraum import Ferienzeitraum
from app.models.pfarrei import Pfarrei

_CACHE_TTL_SECONDS = 60 * 60 * 24
# Domäne ist ohnehin klein (16 Bundesländer x wenige Jahre), aber ein explizites Limit statt
# unbegrenzten Wachstums über die Prozess-Laufzeit - älteste Einträge fliegen zuerst raus.
_CACHE_MAXSIZE = 128

# ferien-api.de meldet ein Rate-Limit (429) mit `x-ratelimit-remaining: 0`, das sich erfahrungsgemäß
# nicht innerhalb weniger Sekunden erholt - ein Retry mit Sekunden-Backoff (siehe `_get_mit_retry`)
# ist gegen ein bereits erschöpftes Limit wirkungslos und verzögert nur die (ohnehin unvermeidliche)
# Fehlermeldung. Stattdessen für eine Weile gar nicht erst erneut anfragen, sobald ein 429 auftrat -
# das begrenzt außerdem, wie sehr wiederholte Aufrufe (z.B. jedes "Füllen") das Limit weiter
# strapazieren.
_RATE_LIMIT_COOLDOWN_SECONDS = 5 * 60


class FerienSyncCache:
    """Cache (pro Bundesland+Jahr) für erfolgreiche Antworten der externen Ferien-Quelle plus deren
    Rate-Limit-Zustand, gebündelt in einer Instanz statt in Modul-Globals. Mehrfache Sync-Aufrufe
    (mehrere Pfarreien, wiederholtes "Jetzt aktualisieren") sollen ferien-api.de nicht unnötig oft
    anfragen - `_default_cache` unten ist die eine Instanz, die dafür implizit pro Prozess lebt
    (wirkt also weiterhin nur innerhalb eines Prozesses, siehe app/rate_limit.py für dasselbe
    Muster/dieselbe Einschränkung). Tests legen stattdessen eigene, voneinander isolierte Instanzen
    an, statt Modul-Globals zurückzusetzen - genau dafür ist der Zustand hier gekapselt statt als
    Modul-Globals zu liegen.
    """

    def __init__(
        self,
        *,
        ttl_seconds: float = _CACHE_TTL_SECONDS,
        maxsize: int = _CACHE_MAXSIZE,
        rate_limit_cooldown_seconds: float = _RATE_LIMIT_COOLDOWN_SECONDS,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._maxsize = maxsize
        self._rate_limit_cooldown_seconds = rate_limit_cooldown_seconds
        self._eintraege: dict[tuple[str, int], tuple[float, list[dict]]] = {}
        # Schützt Schreibzugriffe auf `_eintraege`, da Jahre parallel aus mehreren Threads abgerufen
        # werden (siehe `_hole_rohdaten`) und das Größenlimit sonst durch eine Race beim
        # Eviction-Check verletzt werden könnte.
        self._lock = threading.Lock()
        self._rate_limited_until = 0.0

    def get(self, bundesland: str, jahr: int) -> list[dict] | None:
        gecached = self._eintraege.get((bundesland, jahr))
        if gecached is None:
            return None
        gecacht_am, daten = gecached
        if time.monotonic() - gecacht_am >= self._ttl_seconds:
            return None
        return daten

    def set(self, bundesland: str, jahr: int, daten: list[dict]) -> None:
        with self._lock:
            self._eintraege[(bundesland, jahr)] = (time.monotonic(), daten)
            if len(self._eintraege) > self._maxsize:
                aeltester_key = min(self._eintraege, key=lambda key: self._eintraege[key][0])
                del self._eintraege[aeltester_key]

    def clear(self) -> None:
        with self._lock:
            self._eintraege.clear()

    def ist_rate_limitiert(self) -> bool:
        return time.monotonic() < self._rate_limited_until

    def rate_limit_setzen(self) -> None:
        self._rate_limited_until = time.monotonic() + self._rate_limit_cooldown_seconds

    def rate_limit_zuruecksetzen(self) -> None:
        self._rate_limited_until = 0.0


# Prozessweite Standard-Instanz, die die öffentlichen Funktionen unten implizit verwenden - erhält
# das bisherige Verhalten (ein geteilter Cache-/Rate-Limit-Zustand pro Prozess), ohne dass Aufrufer
# sich um eine Instanz kümmern müssen. Tests erzeugen stattdessen eigene `FerienSyncCache()`-Objekte
# und übergeben sie explizit (siehe `tests/test_ferien_sync.py`).
_default_cache = FerienSyncCache()


class FerienSyncFehler(Exception):
    """Wird geworfen, wenn die externe Ferien-Quelle nicht erreichbar ist."""

    def __init__(self, message: str, *, rate_limited: bool = False) -> None:
        super().__init__(message)
        self.rate_limited = rate_limited


def _schuljahr(datum: date) -> str:
    if datum.month >= 9:
        return f"{datum.year}/{datum.year + 1}"
    return f"{datum.year - 1}/{datum.year}"


_RETRY_VERSUCHE = 2


def _get_mit_retry(
    client: httpx.Client, url: str, *, cache: FerienSyncCache = _default_cache
) -> httpx.Response:
    """ferien-api.de antwortet unter Last gelegentlich mit 5xx statt mit den Daten - ein kurzer
    Retry mit Backoff behebt die meisten dieser transienten Fehler, die sonst den kompletten Sync
    (und damit `POST .../ferien/aktualisieren`) mit 502 scheitern lassen. Timeout und Versuchszahl
    bewusst knapp gehalten (worst case pro Jahr ~13s statt zuvor ~33s) - ein eigener
    vorgeschalteter Reverse-Proxy des Nutzers hat sonst selbst mit 502 abgebrochen, bevor der Sync
    überhaupt fertig retryen konnte. Ein 429 wird dagegen nie retried, siehe
    `FerienSyncCache.rate_limit_setzen`."""
    if cache.ist_rate_limitiert():
        raise FerienSyncFehler(
            "Externe Ferien-Quelle ist aktuell rate-limitiert, bitte später erneut versuchen",
            rate_limited=True,
        )
    letzter_fehler: httpx.HTTPError | None = None
    for versuch in range(_RETRY_VERSUCHE):
        if versuch:
            time.sleep(0.5 * 2**versuch)
        try:
            response = client.get(url)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                cache.rate_limit_setzen()
                raise FerienSyncFehler(
                    "Externe Ferien-Quelle ist aktuell rate-limitiert, bitte später erneut"
                    " versuchen",
                    rate_limited=True,
                ) from exc
            letzter_fehler = exc
            if exc.response.status_code not in (502, 503, 504):
                raise
            continue
        except httpx.HTTPError as exc:
            letzter_fehler = exc
            continue
        return response
    assert letzter_fehler is not None
    raise letzter_fehler


def _ferien_fuer_jahr(
    bundesland: str, jahr: int, client: httpx.Client, *, cache: FerienSyncCache = _default_cache
) -> list[dict]:
    gecached = cache.get(bundesland, jahr)
    if gecached is not None:
        return gecached

    url = settings.ferien_api_url.format(bundesland=bundesland, jahr=jahr)
    response = _get_mit_retry(client, url, cache=cache)
    daten = response.json()
    cache.set(bundesland, jahr, daten)
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
    # Vorab aus dem ORM-Objekt lesen statt aus den Worker-Threads heraus: die SQLAlchemy-Session
    # dahinter ist nicht thread-sicher, ein Zugriff auf `pfarrei.bundesland` aus mehreren Threads
    # gleichzeitig führte in Tests zu `ObjectDeletedError`.
    bundesland = pfarrei.bundesland.value
    try:
        # Jahre parallel statt sequenziell abrufen (httpx.Client ist thread-safe für gleichzeitige
        # Requests) - bei mehreren Jahren summiert sich sonst die worst-case Blockierzeit der
        # einzelnen Retries, was den vorgeschalteten Reverse-Proxy des Nutzers eher in dessen
        # eigenen Timeout laufen lässt (siehe 502-Ausfälle).
        with (
            httpx.Client(timeout=6.0) as client,
            ThreadPoolExecutor(max_workers=len(jahre) or 1) as pool,
        ):
            # Bewusst der modulweite Name (nicht z.B. eine gebundene Referenz darauf) - Tests
            # ersetzen `ferien_sync._ferien_fuer_jahr` per monkeypatch, was nur greift, wenn hier
            # weiterhin der globale Name zur Aufrufzeit nachgeschlagen wird.
            ergebnisse = pool.map(lambda jahr: _ferien_fuer_jahr(bundesland, jahr, client), jahre)
            return [eintrag for daten in ergebnisse for eintrag in daten]
    except httpx.HTTPError as exc:
        raise FerienSyncFehler(
            "Ferien-Kalender konnte nicht abgerufen werden, bestehende Daten bleiben erhalten"
        ) from exc


def _datum(wert: str) -> date:
    # ferien-api.maxleistner.de liefert "2026-02-16T00:00Z" statt eines reinen Datums - die ersten
    # 10 Zeichen sind in beiden Formaten (und im Test-/E2E-Stub, der weiterhin ein reines Datum
    # liefert) gleich, ein strptime auf den vollen Wert bräuchte sonst zwei Formate.
    return datetime.strptime(wert[:10], "%Y-%m-%d").date()


def _als_zeitraeume(pfarrei: Pfarrei, rohdaten: list[dict]) -> list[Ferienzeitraum]:
    zeitraeume = []
    for eintrag in rohdaten:
        start_datum = _datum(eintrag["start"])
        end_datum = _datum(eintrag["end"])
        zeitraeume.append(
            Ferienzeitraum(
                pfarrei_id=pfarrei.id,
                # name_cp ("Winterferien") ist die großgeschriebene Variante von name
                # ("winterferien") - fällt auf name zurück, falls ein Aufrufer (z.B. der
                # Test-/E2E-Stub) kein name_cp liefert.
                name=eintrag.get("name_cp") or eintrag["name"],
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
