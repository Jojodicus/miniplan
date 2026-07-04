from pydantic import BaseModel, ConfigDict

from app.models.nutzer import PfarreiRolle


class NutzerPfarreiRolleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pfarrei_id: int
    rolle: PfarreiRolle


class NutzerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    ist_admin: bool
    pfarrei_rollen: list[NutzerPfarreiRolleOut] = []
