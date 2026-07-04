from datetime import date

from pydantic import BaseModel, ConfigDict


class FerienzeitraumOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    start_datum: date
    end_datum: date
    schuljahr: str
