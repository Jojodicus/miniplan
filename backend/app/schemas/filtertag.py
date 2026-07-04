from pydantic import BaseModel, ConfigDict, Field


class FiltertagCreate(BaseModel):
    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    label: str = Field(min_length=1, max_length=255)
    ist_schueler_artig: bool = False


class FiltertagUpdate(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    ist_schueler_artig: bool = False


class FiltertagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pfarrei_id: int
    key: str
    label: str
    ist_schueler_artig: bool
