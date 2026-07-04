from typing import TYPE_CHECKING

from sqlalchemy import JSON, Column, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.gruppe import Gruppe

dienst_typ_gruppen = Table(
    "dienst_typ_gruppen",
    Base.metadata,
    Column("dienst_typ_id", ForeignKey("dienst_typen.id"), primary_key=True),
    Column("gruppe_id", ForeignKey("gruppen.id"), primary_key=True),
)


class DienstTyp(Base):
    __tablename__ = "dienst_typen"
    __table_args__ = (UniqueConstraint("pfarrei_id", "name", name="uq_dienst_typ_pfarrei_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    name: Mapped[str] = mapped_column(String(255))
    standard_anzahl: Mapped[int] = mapped_column(Integer, default=1)
    erforderliche_filtertags: Mapped[list[str]] = mapped_column(JSON, default=list)

    erlaubte_gruppen: Mapped[list["Gruppe"]] = relationship(secondary=dienst_typ_gruppen)
