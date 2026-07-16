from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.mini import Mini


class MiniMiniplanLimit(Base):
    """Überschreibt für einen einzelnen Mini das Einsatz-Limit innerhalb genau eines Miniplans.
    Die Existenz der Zeile bedeutet "überschrieben" - `max_einsaetze=None` ist dabei eine
    explizite Aufhebung jedes Limits für diesen Mini in diesem Plan (unterscheidet sich damit von
    "keine Überschreibung", die auf `Mini.max_einsaetze_pro_monat`/
    `Miniplan.max_einsaetze_standard` zurückfällt, siehe services/zuteilung.py)."""

    __tablename__ = "mini_miniplan_limits"
    __table_args__ = (UniqueConstraint("miniplan_id", "mini_id", name="uq_mini_miniplan_limit"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    miniplan_id: Mapped[int] = mapped_column(ForeignKey("miniplaene.id", ondelete="CASCADE"))
    mini_id: Mapped[int] = mapped_column(ForeignKey("minis.id", ondelete="CASCADE"))
    max_einsaetze: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    mini: Mapped["Mini"] = relationship()

    @property
    def mini_name(self) -> str:
        """Für `MiniLimitOut.mini_name`, damit das Frontend keinen eigenen Mini-Lookup braucht."""
        return self.mini.name
