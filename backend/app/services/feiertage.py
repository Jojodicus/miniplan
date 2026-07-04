import re
import unicodedata
from datetime import date
from typing import TypedDict

import holidays


class BerechneterFeiertag(TypedDict):
    key: str
    name: str
    datum: date


def _slug(name: str) -> str:
    normalisiert = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalisiert.lower()).strip("-")


def berechne_feiertage(bundesland: str, jahr: int) -> list[BerechneterFeiertag]:
    feiertage = holidays.Germany(subdiv=bundesland, years=jahr, language="de")
    return [
        {"key": _slug(name), "name": name, "datum": datum}
        for datum, name in sorted(feiertage.items())
    ]


# Keys von Feiertagen, die die `holidays`-Bibliothek für ein Bundesland zwar als gesetzlichen
# Feiertag listet, die aber (anders als alle übrigen von ihr gelieferten Feiertage) KEIN
# gesetzlicher arbeitsfreier Tag sind. Dient als Erweiterungspunkt für Sonderfälle.
#
# Buß- und Bettag wurde hier bewusst NICHT aufgenommen: `holidays.Germany` listet ihn ohnehin nur
# für Sachsen (subdiv="SN") - dort ist er aber ein vollwertiger gesetzlicher, arbeitsfreier
# Feiertag (finanziert über einen leicht höheren Pflegeversicherungsbeitrag), keine
# schulfrei-only-Ausnahme. In Bayern ist er gar kein gesetzlicher Feiertag und taucht in den
# `holidays`-Daten für "BY" überhaupt nicht auf - dass er dort dennoch schulfrei ist, ist eine
# rein schulkalendarische Entscheidung der Kultusministerien, die weder `holidays` noch andere
# gängige Feiertags-APIs (z.B. Nager.Date) abbilden; dafür bräuchte man die Schulferien-Kalender
# der Länder (wie hier bereits separat über `Ferienzeitraum`/`ferien_sync.py` synchronisiert).
SCHULFREI_NUR_KEYS: set[str] = set()


def default_arbeiter_frei(feiertag_key: str) -> bool:
    """Default für `FeiertagEinstellung.arbeiter_frei`, solange die Pfarrei keine eigene
    Einstellung für diesen Feiertag hinterlegt hat: alle von `holidays` gelieferten Feiertage
    sind gesetzliche, arbeitsfreie Feiertage und daher default arbeiter_frei=True, mit Ausnahme
    der in SCHULFREI_NUR_KEYS gepflegten Sonderfälle."""
    return feiertag_key not in SCHULFREI_NUR_KEYS
