from datetime import time

from sqlalchemy import Enum, ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.filtertag import Filtertag


class FiltertagBlocker(Base):
    __tablename__ = "filtertag_blocker"

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    filtertag: Mapped[Filtertag] = mapped_column(Enum(Filtertag))
    wochentag: Mapped[int] = mapped_column(Integer)
    start_zeit: Mapped[time] = mapped_column(Time)
    end_zeit: Mapped[time] = mapped_column(Time)
