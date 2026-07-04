from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.dienstbedarf import DienstbedarfIn, DienstbedarfOut


class GottesdienstIn(BaseModel):
    datum: date
    uhrzeit: time
    name: str = Field(min_length=1, max_length=255)
    notiz: str | None = None
    dienstbedarf: list[DienstbedarfIn] = []


class GottesdienstOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    miniplan_id: int
    datum: date
    uhrzeit: time
    name: str
    notiz: str | None
    dienstbedarf: list[DienstbedarfOut]
