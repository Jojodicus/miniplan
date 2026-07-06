from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dienst_typ import GruppenAnforderung, GruppenAnforderungOut
from app.schemas.mini import MiniOut


class DienstbedarfIn(BaseModel):
    dienst_typ_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    anzahl: int = Field(ge=1)
    erforderliche_filtertags: list[str] = []
    gruppen_anforderungen: list[GruppenAnforderung] = []
    mini_ids: list[int] = []
    zeige_label: bool = True

    @model_validator(mode="after")
    def _entweder_dienst_typ_oder_name(self) -> "DienstbedarfIn":
        if (self.dienst_typ_id is None) == (self.name is None):
            raise ValueError(
                "Entweder dienst_typ_id oder name muss gesetzt sein, nicht beides oder keines"
            )
        for anforderung in self.gruppen_anforderungen:
            if anforderung.mindest_anzahl > self.anzahl:
                raise ValueError(
                    "Die Mindestanzahl einer Gruppe darf die Anzahl nicht überschreiten"
                )
        summe = sum(a.mindest_anzahl for a in self.gruppen_anforderungen)
        if summe > self.anzahl:
            raise ValueError(
                "Die Summe der Mindestanzahlen darf die Anzahl nicht überschreiten"
            )
        if len(self.mini_ids) > self.anzahl:
            raise ValueError(
                "Es dürfen nicht mehr Minis zugewiesen werden als die Anzahl vorgibt"
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
    erforderliche_filtertags: list[str]
    gruppen_anforderungen: list[GruppenAnforderungOut]
    zugewiesene_minis: list[MiniOut]
    zeige_label: bool
