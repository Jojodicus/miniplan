from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.filtertag import Filtertag


class FiltertagBlocker(Base):
    __tablename__ = "filtertag_blocker"

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    filtertag_id: Mapped[int] = mapped_column(ForeignKey("filtertags.id"))
    wochentag: Mapped[int] = mapped_column(Integer)
    start_zeit: Mapped[time] = mapped_column(Time)
    end_zeit: Mapped[time] = mapped_column(Time)

    filtertag: Mapped["Filtertag"] = relationship()
