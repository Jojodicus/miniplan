from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.bundesland import Bundesland


class PfarreiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    bundesland: Bundesland
    bild_dateiname: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def hat_bild(self) -> bool:
        return self.bild_dateiname is not None


class PfarreiBundeslandUpdate(BaseModel):
    bundesland: Bundesland


class PfarreiCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    bundesland: Bundesland = Bundesland.BY


class PfarreiUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
