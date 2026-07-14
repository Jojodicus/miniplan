from datetime import date

from sqlalchemy import Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Ferienzeitraum(Base):
    __tablename__ = "ferienzeitraeume"
    __table_args__ = (
        Index("ix_ferienzeitraeume_pfarrei_zeitraum", "pfarrei_id", "start_datum", "end_datum"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    start_datum: Mapped[date] = mapped_column(Date)
    end_datum: Mapped[date] = mapped_column(Date)
    schuljahr: Mapped[str] = mapped_column(String(16))
