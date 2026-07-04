from datetime import date, time

from pydantic import BaseModel, Field

from app.models.filtertag import Filtertag


class VorschauGruppenAnforderung(BaseModel):
    gruppe_name: str
    mindest_anzahl: int = Field(ge=0)


class VorschauDienstbedarf(BaseModel):
    name: str
    anzahl: int = Field(ge=0)
    erforderliche_filtertags: list[Filtertag] = []
    gruppen_anforderungen: list[VorschauGruppenAnforderung] = []
    zugewiesene_minis: list[str] = []


class VorschauGottesdienst(BaseModel):
    datum: date
    uhrzeit: time
    name: str
    dienstbedarf: list[VorschauDienstbedarf] = []


class MiniplanVorschauIn(BaseModel):
    monat: int = Field(ge=1, le=12)
    jahr: int = Field(ge=2000)
    veranstaltungen: str | None = None
    ankuendigungen: str | None = None
    gottesdienste: list[VorschauGottesdienst] = []
