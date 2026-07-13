from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.pfarrei import Pfarrei


class Filtertag(Base):
    """Ein per Pfarrei frei definierbarer Verfügbarkeits-Status für Minis (z.B. "Grundschüler",
    "Schüler", "Arbeiter"), inkl. Markierung ob er sich wie ein Schüler-Status verhält (Ferien-
    und Feiertags-Regeln nach Schulfrei statt Arbeiter-frei)."""

    __tablename__ = "filtertags"
    __table_args__ = (UniqueConstraint("pfarrei_id", "key", name="uq_filtertag_pfarrei_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(255))
    ist_schueler_artig: Mapped[bool] = mapped_column(Boolean, default=False)

    pfarrei: Mapped["Pfarrei"] = relationship()
