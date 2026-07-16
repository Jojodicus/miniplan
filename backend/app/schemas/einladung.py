from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.nutzer import PfarreiRolle


class EinladungCreate(BaseModel):
    rolle: PfarreiRolle = PfarreiRolle.BETRACHTER


class EinladungOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token: str
    pfarrei_id: int
    rolle: PfarreiRolle
    erstellt_am: datetime
    laeuft_ab_am: datetime
    eingeloest_am: datetime | None


class EinladungVorschau(BaseModel):
    """Öffentliche Vorschau eines Einladungslinks (`GET /api/einladungen/{token}`, kein Auth) -
    liefert absichtlich keine Nutzer-/Pfarrei-internen Details, nur was das Formular zur
    Annahme der Einladung braucht."""

    pfarrei_name: str
    rolle: PfarreiRolle
    gueltig: bool


class EinladungAnnehmen(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
