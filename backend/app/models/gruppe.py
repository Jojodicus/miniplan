from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.pfarrei import Pfarrei


class Gruppe(Base):
    __tablename__ = "gruppen"
    __table_args__ = (UniqueConstraint("pfarrei_id", "name", name="uq_gruppe_pfarrei_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    name: Mapped[str] = mapped_column(String(255))

    pfarrei: Mapped["Pfarrei"] = relationship()
