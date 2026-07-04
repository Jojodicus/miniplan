from datetime import time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FiltertagBlockerCreate(BaseModel):
    filtertag_id: int
    wochentag: int = Field(ge=0, le=6)
    start_zeit: time
    end_zeit: time

    @model_validator(mode="after")
    def _end_nach_start(self) -> "FiltertagBlockerCreate":
        if self.end_zeit <= self.start_zeit:
            raise ValueError("Die Endzeit muss nach der Startzeit liegen")
        return self


class FiltertagBlockerUpdate(FiltertagBlockerCreate):
    pass


class FiltertagBlockerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    filtertag_id: int
    wochentag: int
    start_zeit: time
    end_zeit: time
