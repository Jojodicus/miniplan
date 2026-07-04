import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.gottesdienst import Gottesdienst


class MiniplanStatus(str, enum.Enum):
    IN_BEARBEITUNG = "in_bearbeitung"
    ABGESCHLOSSEN = "abgeschlossen"


class Miniplan(Base):
    __tablename__ = "miniplaene"
    __table_args__ = (
        UniqueConstraint("pfarrei_id", "monat", "jahr", name="uq_miniplan_pfarrei_monat_jahr"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    monat: Mapped[int] = mapped_column(Integer)
    jahr: Mapped[int] = mapped_column(Integer)
    status: Mapped[MiniplanStatus] = mapped_column(
        Enum(MiniplanStatus), default=MiniplanStatus.IN_BEARBEITUNG
    )
    veranstaltungen: Mapped[str | None] = mapped_column(Text, default=None)
    ankuendigungen: Mapped[str | None] = mapped_column(Text, default=None)

    gottesdienste: Mapped[list["Gottesdienst"]] = relationship(
        back_populates="miniplan",
        cascade="all, delete-orphan",
        order_by="(Gottesdienst.datum, Gottesdienst.uhrzeit)",
    )
