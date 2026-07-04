from datetime import date, time
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.dienstbedarf import Dienstbedarf
    from app.models.miniplan import Miniplan


class Gottesdienst(Base):
    __tablename__ = "gottesdienste"

    id: Mapped[int] = mapped_column(primary_key=True)
    miniplan_id: Mapped[int] = mapped_column(ForeignKey("miniplaene.id"))
    datum: Mapped[date] = mapped_column(Date)
    uhrzeit: Mapped[time] = mapped_column(Time)
    name: Mapped[str] = mapped_column(String(255))

    miniplan: Mapped["Miniplan"] = relationship(back_populates="gottesdienste")
    dienstbedarf: Mapped[list["Dienstbedarf"]] = relationship(
        back_populates="gottesdienst", cascade="all, delete-orphan"
    )
