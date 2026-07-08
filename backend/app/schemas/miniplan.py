from pydantic import BaseModel, ConfigDict, Field

from app.models.miniplan import MiniplanStatus
from app.schemas.gottesdienst import GottesdienstOut


class MiniplanCreate(BaseModel):
    monat: int = Field(ge=1, le=12)
    jahr: int = Field(ge=2000)


class MiniplanUpdate(BaseModel):
    veranstaltungen: str | None = None
    ankuendigungen: str | None = None


class MiniplanStatusUpdate(BaseModel):
    status: MiniplanStatus


class MiniplanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    monat: int
    jahr: int
    status: MiniplanStatus
    veranstaltungen: str | None
    ankuendigungen: str | None
    gottesdienste: list[GottesdienstOut]
