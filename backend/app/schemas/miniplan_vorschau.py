from datetime import date, time

from pydantic import BaseModel, Field


class VorschauGruppenAnforderung(BaseModel):
    gruppe_name: str
    mindest_anzahl: int = Field(ge=0)


class VorschauDienstbedarf(BaseModel):
    name: str
    anzahl: int = Field(ge=0)
    erforderliche_filtertags: list[str] = []
    gruppen_anforderungen: list[VorschauGruppenAnforderung] = []
    zugewiesene_minis: list[str] = []
    zeige_label: bool = True


class VorschauGottesdienst(BaseModel):
    datum: date
    uhrzeit: time
    name: str | None = None
    notiz: str | None = None
    dienstbedarf: list[VorschauDienstbedarf] = []


class MiniplanVorschauIn(BaseModel):
    monat: int = Field(ge=1, le=12)
    jahr: int = Field(ge=2000)
    veranstaltungen: str | None = None
    ankuendigungen: str | None = None
    gottesdienste: list[VorschauGottesdienst] = []
