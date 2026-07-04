import enum


class Filtertag(str, enum.Enum):
    GRUNDSCHUELER = "grundschueler"
    SCHUELER = "schueler"
    ARBEITER = "arbeiter"
