import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, Float, ForeignKey, Integer, Text, UniqueConstraint
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

    # Konfiguration der automatischen Zuteilung ("Füllen"). Die Defaults reproduzieren das
    # ursprüngliche, fest verdrahtete Verhalten (siehe services/zuteilung.py):
    # - fairness_gewicht: wie stark die Diensthäufigkeit über die Minis ausgeglichen wird
    # - mindestabstand_tage: Schwelle, unter der aufeinanderfolgende Termine desselben Minis
    #   bestraft werden
    # - mixing_gewicht: Soft-Strafe, wenn dieselben Minis wiederholt gemeinsam eingeteilt sind
    #   (Teams durchmischen); 0 = aus
    # - wiederholung_gewicht: Soft-Bonus, wenn ein Mini demselben Dienst/derselben Uhrzeit treu
    #   bleibt (gegenläufig zum Mixing); 0 = aus
    fairness_gewicht: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0")
    mindestabstand_tage: Mapped[int] = mapped_column(Integer, default=6, server_default="6")
    mixing_gewicht: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    wiederholung_gewicht: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    gottesdienste: Mapped[list["Gottesdienst"]] = relationship(
        back_populates="miniplan",
        cascade="all, delete-orphan",
        order_by="(Gottesdienst.datum, Gottesdienst.uhrzeit)",
    )
