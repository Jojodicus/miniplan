from pydantic import BaseModel, ConfigDict, Field

from app.models.filtertag import Filtertag


class MiniCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    gruppe_id: int
    filtertags: list[Filtertag] = []


class MiniUpdate(MiniCreate):
    pass


class MiniOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    gruppe_id: int
    name: str
    filtertags: list[Filtertag]
