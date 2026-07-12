"""Speichern/Löschen/Auffinden hochgeladener Pfarrei-Bilder im media_dir.

Bilder liegen bewusst im persistenten Datenverzeichnis (nicht im Frontend-Build) und werden nur
über einen autorisierten API-Endpunkt ausgeliefert, damit der Zugriff an die Pfarrei-Rolle
gebunden bleibt."""

from pathlib import Path

from app.config import settings

# Zulässige Bildtypen mit ihrer Dateiendung. Die Validierung erfolgt über den Content-Type des
# Uploads (nicht nur die Endung).
ERLAUBTE_TYPEN: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
MAX_BYTES = 5 * 1024 * 1024


def _media_dir() -> Path:
    return Path(settings.media_dir)


def bild_speichern(pfarrei_id: int, content_type: str, daten: bytes) -> str:
    """Legt das Bild als `pfarrei-{id}.{ext}` ab, entfernt zuvor eine evtl. andersformatige
    Altversion, und liefert den gespeicherten Dateinamen zurück."""
    endung = ERLAUBTE_TYPEN[content_type]
    verzeichnis = _media_dir()
    verzeichnis.mkdir(parents=True, exist_ok=True)
    # Alte Dateien anderer Endung entfernen, damit nicht zwei Bilder derselben Pfarrei übrig
    # bleiben.
    for alte_endung in ERLAUBTE_TYPEN.values():
        alt = verzeichnis / f"pfarrei-{pfarrei_id}.{alte_endung}"
        if alt.is_file():
            alt.unlink()
    dateiname = f"pfarrei-{pfarrei_id}.{endung}"
    (verzeichnis / dateiname).write_bytes(daten)
    return dateiname


def bild_pfad(dateiname: str) -> Path:
    return _media_dir() / dateiname


def bild_loeschen(dateiname: str) -> None:
    pfad = bild_pfad(dateiname)
    if pfad.is_file():
        pfad.unlink()
