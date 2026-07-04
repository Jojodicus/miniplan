from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.filtertag import Filtertag
from app.schemas.dienst_typ import GruppenAnforderung, GruppenAnforderungOut
from app.schemas.mini import MiniOut


class DienstbedarfIn(BaseModel):
    dienst_typ_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    anzahl: int = Field(ge=0)
    erforderliche_filtertags: list[Filtertag] = []
    gruppen_anforderungen: list[GruppenAnforderung] = []
    mini_ids: list[int] = []

    @model_validator(mode="after")
    def _entweder_dienst_typ_oder_name(self) -> "DienstbedarfIn":
        if (self.dienst_typ_id is None) == (self.name is None):
            raise ValueError(
                "Entweder dienst_typ_id oder name muss gesetzt sein, nicht beides oder keines"
            )
        summe = sum(a.mindest_anzahl for a in self.gruppen_anforderungen)
        if summe > self.anzahl:
            raise ValueError(
                "Die Summe der Mindestanzahlen darf die Anzahl nicht überschreiten"
            )
        return self


class DienstTypSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DienstbedarfOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dienst_typ: DienstTypSummary | None
    name: str | None
    anzahl: int
    erforderliche_filtertags: list[Filtertag]
    gruppen_anforderungen: list[GruppenAnforderungOut]
    zugewiesene_minis: list[MiniOut]
