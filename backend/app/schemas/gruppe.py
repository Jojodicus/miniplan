from pydantic import BaseModel, ConfigDict, Field


class GruppeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class GruppeUpdate(GruppeCreate):
    pass


class GruppeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    name: str
