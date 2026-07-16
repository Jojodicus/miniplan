from pydantic import BaseModel, ConfigDict, Field


class MiniLimitIn(BaseModel):
    """`max_einsaetze=None` hebt jedes Limit für diesen Mini in diesem Plan explizit auf."""

    max_einsaetze: int | None = Field(default=None, ge=0)


class MiniLimitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mini_id: int
    mini_name: str
    max_einsaetze: int | None
