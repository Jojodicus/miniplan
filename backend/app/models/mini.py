from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.gruppe import Gruppe


class Mini(Base):
    __tablename__ = "minis"

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id", ondelete="CASCADE"))
    # kein ondelete=CASCADE: Gruppe.loeschen blockiert (409) solange Minis existieren, siehe
    # api/gruppen.py - eine Gruppe mit Minis soll nie einfach mitgelöscht werden.
    gruppe_id: Mapped[int] = mapped_column(ForeignKey("gruppen.id"))
    name: Mapped[str] = mapped_column(String(255))
    filtertags: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Persönliche Obergrenze für Einsätze pro Miniplan (Monat) - übersteuert, falls gesetzt, den
    # planweiten Standard `Miniplan.max_einsaetze_standard` (siehe services/zuteilung.py). None =
    # kein persönliches Limit.
    max_einsaetze_pro_monat: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    gruppe: Mapped["Gruppe"] = relationship()
