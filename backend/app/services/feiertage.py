import re
import unicodedata
from datetime import date, timedelta
from functools import lru_cache
from typing import TypedDict

import holidays


class BerechneterFeiertag(TypedDict):
    key: str
    name: str
    datum: date


def _slug(name: str) -> str:
    normalisiert = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalisiert.lower()).strip("-")


# Eigener Key statt des von `_slug("Buß- und Bettag")` gelieferten "buss-und-bettag": Sachsen
# bekommt seinen (gesetzlichen, arbeitsfreien) Buß- und Bettag bereits über `holidays.Germany`
# unter genau diesem Key - ein eigener Key für den bayerischen Sonderfall verhindert, dass beide
# über denselben Key gemeinsam in SCHULFREI_NUR_KEYS landen und Sachsens Feiertag dadurch
# fälschlich als nicht-arbeitsfrei gilt.
BUSS_UND_BETTAG_KEY = "buss-und-bettag-schulfrei-bayern"


def _buss_und_bettag(jahr: int) -> date:
    """Buß- und Bettag ist der Mittwoch vor dem 23. November (bzw. der 23. November selbst,
    falls dieser auf einen Mittwoch fällt) - Mittwoch = weekday() 2."""
    nov23 = date(jahr, 11, 23)
    return nov23 - timedelta(days=(nov23.weekday() - 2) % 7)


# Reines Funktionsergebnis von (bundesland, jahr) - `holidays.Germany(...)` baut bei jedem Aufruf
# einen kompletten Kalender inkl. Locale-Lookups neu auf und ist damit teuer genug, dass ein
# ungecachter Aufruf pro (Mini, Datum)-Kombination in `verfuegbarkeit.ist_blockiert` die
# automatische Zuteilung (die genau das für jede Kombination tut) spürbar verlangsamt.
# maxsize genügend über der eigentlichen Domäne (16 Bundesländer x ein paar Jahre) für ein
# klares Limit statt unbegrenzten Wachstums über die Prozess-Laufzeit.
@lru_cache(maxsize=256)
def berechne_feiertage(bundesland: str, jahr: int) -> list[BerechneterFeiertag]:
    feiertage = holidays.Germany(subdiv=bundesland, years=jahr, language="de")
    berechnete = [
        {"key": _slug(name), "name": name, "datum": datum}
        for datum, name in sorted(feiertage.items())
    ]
    # In Bayern ist Buß- und Bettag kein gesetzlicher Feiertag (siehe Kommentar bei
    # SCHULFREI_NUR_KEYS) und taucht daher nicht in den `holidays`-Daten auf - er ist dort rein
    # schulkalendarisch schulfrei, wird hier also als Sonderfall ergänzt. Sachsen bekommt ihn
    # bereits vollständig (als gesetzlichen, arbeitsfreien Feiertag) über `holidays.Germany`.
    if bundesland == "BY":
        berechnete.append(
            {
                "key": BUSS_UND_BETTAG_KEY,
                "name": "Buß- und Bettag",
                "datum": _buss_und_bettag(jahr),
            }
        )
        berechnete.sort(key=lambda f: f["datum"])
    return berechnete


# Keys von Feiertagen, die für ein Bundesland zwar in der Liste auftauchen (sei es über die
# `holidays`-Bibliothek oder als manueller Sonderfall wie Buß- und Bettag in Bayern), die aber
# (anders als alle übrigen gelieferten Feiertage) KEIN gesetzlicher arbeitsfreier Tag sind.
#
# Buß- und Bettag ist hier nur für den Bayern-Sonderfall aufgenommen: `holidays.Germany` listet
# ihn für Sachsen (subdiv="SN") bereits selbst als vollwertigen gesetzlichen, arbeitsfreien
# Feiertag (finanziert über einen leicht höheren Pflegeversicherungsbeitrag) - dort greift diese
# Ausnahme also nicht, da für Sachsen kein manueller Eintrag über `_buss_und_bettag` erzeugt wird.
# In Bayern ist er dagegen gar kein gesetzlicher Feiertag, sondern eine rein schulkalendarische
# Entscheidung der Kultusministerien - daher schulfrei, aber nicht arbeitsfrei.
SCHULFREI_NUR_KEYS: set[str] = {BUSS_UND_BETTAG_KEY}


def default_arbeiter_frei(feiertag_key: str) -> bool:
    """Default für `FeiertagEinstellung.arbeiter_frei`, solange die Pfarrei keine eigene
    Einstellung für diesen Feiertag hinterlegt hat: alle von `holidays` gelieferten Feiertage
    sind gesetzliche, arbeitsfreie Feiertage und daher default arbeiter_frei=True, mit Ausnahme
    der in SCHULFREI_NUR_KEYS gepflegten Sonderfälle."""
    return feiertag_key not in SCHULFREI_NUR_KEYS
