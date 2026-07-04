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
