from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.gruppe import Gruppe


class DienstTyp(Base):
    __tablename__ = "dienst_typen"
    __table_args__ = (UniqueConstraint("pfarrei_id", "name", name="uq_dienst_typ_pfarrei_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    name: Mapped[str] = mapped_column(String(255))
    standard_anzahl: Mapped[int] = mapped_column(Integer, default=1)
    zeige_label: Mapped[bool] = mapped_column(Boolean, default=False)

    gruppen_anforderungen: Mapped[list["DienstTypGruppenAnforderung"]] = relationship(
        back_populates="dienst_typ", cascade="all, delete-orphan"
    )


class DienstTypGruppenAnforderung(Base):
    __tablename__ = "dienst_typ_gruppen_anforderungen"
    __table_args__ = (
        UniqueConstraint("dienst_typ_id", "gruppe_id", name="uq_dienst_typ_gruppen_anforderung"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dienst_typ_id: Mapped[int] = mapped_column(ForeignKey("dienst_typen.id"))
    gruppe_id: Mapped[int] = mapped_column(ForeignKey("gruppen.id"))
    mindest_anzahl: Mapped[int] = mapped_column(Integer, default=0)

    dienst_typ: Mapped["DienstTyp"] = relationship(back_populates="gruppen_anforderungen")
    gruppe: Mapped["Gruppe"] = relationship()
