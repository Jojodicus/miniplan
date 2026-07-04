from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.gruppe import Gruppe


class Mini(Base):
    __tablename__ = "minis"

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    gruppe_id: Mapped[int] = mapped_column(ForeignKey("gruppen.id"))
    name: Mapped[str] = mapped_column(String(255))
    filtertags: Mapped[list[str]] = mapped_column(JSON, default=list)

    gruppe: Mapped["Gruppe"] = relationship()
