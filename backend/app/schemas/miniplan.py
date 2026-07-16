from pydantic import BaseModel, ConfigDict, Field

from app.models.miniplan import MiniplanStatus
from app.schemas.gottesdienst import GottesdienstOut
from app.schemas.mini_miniplan_limit import MiniLimitOut


class MiniplanCreate(BaseModel):
    monat: int = Field(ge=1, le=12)
    jahr: int = Field(ge=2000)


class MiniplanUpdate(BaseModel):
    veranstaltungen: str | None = None
    ankuendigungen: str | None = None


class MiniplanStatusUpdate(BaseModel):
    status: MiniplanStatus


class ZuteilungEinstellungen(BaseModel):
    """Konfiguration des automatischen Füllens. Als eigener Endpunkt getrennt vom Freitext-PUT,
    damit der Editor-Autosave (nur Veranstaltungen/Ankündigungen) die Gewichte nicht
    überschreibt."""

    fairness_gewicht: float = Field(ge=0, le=100)
    mindestabstand_tage: int = Field(ge=0, le=31)
    mixing_gewicht: float = Field(ge=0, le=100)
    wiederholung_gewicht: float = Field(ge=0, le=100)
    max_einsaetze_standard: int | None = Field(default=None, ge=0)
    ignoriere_max_einsaetze: bool = False
    ignoriere_gruppen_mindestanzahl: bool = False
    ignoriere_verfuegbarkeit: bool = False


class MiniplanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    monat: int
    jahr: int
    status: MiniplanStatus
    veranstaltungen: str | None
    ankuendigungen: str | None
    fairness_gewicht: float
    mindestabstand_tage: int
    mixing_gewicht: float
    wiederholung_gewicht: float
    max_einsaetze_standard: int | None
    ignoriere_max_einsaetze: bool
    ignoriere_gruppen_mindestanzahl: bool
    ignoriere_verfuegbarkeit: bool
    mini_limits: list[MiniLimitOut]
    gottesdienste: list[GottesdienstOut]


class MiniplanListeOut(BaseModel):
    """Schlanke Variante für die Übersichtsliste - ohne den kompletten Gottesdienst/Dienstbedarf/
    Zuweisungs-Baum, den nur der Editor braucht (siehe `_mit_geladenem_planstand` in
    api/miniplaene.py)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    monat: int
    jahr: int
    status: MiniplanStatus
    gottesdienste_anzahl: int
