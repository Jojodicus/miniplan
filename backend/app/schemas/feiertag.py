from datetime import date

from pydantic import BaseModel


class FeiertagOut(BaseModel):
    key: str
    name: str
    datum: date
    schulfrei: bool
    arbeiter_frei: bool


class FeiertagEinstellungUpdate(BaseModel):
    schulfrei: bool
    arbeiter_frei: bool
