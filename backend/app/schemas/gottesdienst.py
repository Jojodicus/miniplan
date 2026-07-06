from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.dienstbedarf import DienstbedarfIn, DienstbedarfOut


class GottesdienstIn(BaseModel):
    datum: date
    uhrzeit: time
    name: str | None = Field(default=None, max_length=255)
    notiz: str | None = None
    dienstbedarf: list[DienstbedarfIn] = []

    @field_validator("name")
    @classmethod
    def _leeren_namen_zu_none(cls, wert: str | None) -> str | None:
        return wert.strip() if wert and wert.strip() else None


class GottesdienstOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    miniplan_id: int
    datum: date
    uhrzeit: time
    name: str | None
    notiz: str | None
    dienstbedarf: list[DienstbedarfOut]
