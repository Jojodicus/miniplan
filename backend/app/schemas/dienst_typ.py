from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.gruppe import GruppeOut


class GruppenAnforderung(BaseModel):
    gruppe_id: int
    mindest_anzahl: int = Field(ge=1)


class DienstTypCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    standard_anzahl: int = Field(ge=0)
    gruppen_anforderungen: list[GruppenAnforderung] = []
    zeige_label: bool = False

    @model_validator(mode="after")
    def _mindestanzahl_nicht_ueber_standard_anzahl(self) -> "DienstTypCreate":
        for anforderung in self.gruppen_anforderungen:
            if anforderung.mindest_anzahl > self.standard_anzahl:
                raise ValueError(
                    "Die Mindestanzahl einer Gruppe darf die Standard-Anzahl nicht überschreiten"
                )
        summe = sum(a.mindest_anzahl for a in self.gruppen_anforderungen)
        if summe > self.standard_anzahl:
            raise ValueError(
                "Die Summe der Mindestanzahlen darf die Standard-Anzahl nicht überschreiten"
            )
        return self


class DienstTypUpdate(DienstTypCreate):
    pass


class GruppenAnforderungOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    gruppe: GruppeOut
    mindest_anzahl: int


class DienstTypOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    name: str
    standard_anzahl: int
    gruppen_anforderungen: list[GruppenAnforderungOut]
    zeige_label: bool
