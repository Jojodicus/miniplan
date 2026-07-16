from pydantic import BaseModel, ConfigDict, Field


class MiniCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    gruppe_id: int
    filtertags: list[str] = []
    max_einsaetze_pro_monat: int | None = Field(default=None, ge=0)


class MiniUpdate(MiniCreate):
    pass


class MiniOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    gruppe_id: int
    name: str
    filtertags: list[str]
    max_einsaetze_pro_monat: int | None
