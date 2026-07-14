from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.filtertag import Filtertag


class FiltertagBlocker(Base):
    __tablename__ = "filtertag_blocker"
    __table_args__ = (
        Index("ix_filtertag_blocker_lookup", "pfarrei_id", "filtertag_id", "wochentag"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id", ondelete="CASCADE"))
    filtertag_id: Mapped[int] = mapped_column(ForeignKey("filtertags.id", ondelete="CASCADE"))
    wochentag: Mapped[int] = mapped_column(Integer)
    start_zeit: Mapped[time] = mapped_column(Time)
    end_zeit: Mapped[time] = mapped_column(Time)

    filtertag: Mapped["Filtertag"] = relationship()
