from pydantic import BaseModel, ConfigDict, EmailStr, Field

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


class NutzerCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    ist_admin: bool = False


class NutzerUpdate(BaseModel):
    email: EmailStr
    ist_admin: bool


class PasswortReset(BaseModel):
    password: str = Field(min_length=8)


class SelbstEmailAendern(BaseModel):
    email: EmailStr


class SelbstPasswortAendern(BaseModel):
    aktuelles_passwort: str
    neues_passwort: str = Field(min_length=8)


class PfarreiRolleZuweisung(BaseModel):
    pfarrei_id: int
    rolle: PfarreiRolle
