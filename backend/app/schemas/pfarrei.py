from pydantic import BaseModel, ConfigDict

from app.models.bundesland import Bundesland


class PfarreiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    bundesland: Bundesland


class PfarreiBundeslandUpdate(BaseModel):
    bundesland: Bundesland
