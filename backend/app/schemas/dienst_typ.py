from pydantic import BaseModel, ConfigDict, Field

from app.models.filtertag import Filtertag
from app.schemas.gruppe import GruppeOut


class DienstTypCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    standard_anzahl: int = Field(ge=1)
    erforderliche_filtertags: list[Filtertag] = []
    erlaubte_gruppen_ids: list[int] = []


class DienstTypUpdate(DienstTypCreate):
    pass


class DienstTypOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    name: str
    standard_anzahl: int
    erforderliche_filtertags: list[Filtertag]
    erlaubte_gruppen: list[GruppeOut]
