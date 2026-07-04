import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.pfarrei import Pfarrei


class PfarreiRolle(str, enum.Enum):
    PFARREI_VERANTWORTLICHER = "pfarrei_verantwortlicher"
    BETRACHTER = "betrachter"


class Nutzer(Base):
    __tablename__ = "nutzer"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    ist_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    pfarrei_rollen: Mapped[list["NutzerPfarreiRolle"]] = relationship(
        back_populates="nutzer", cascade="all, delete-orphan"
    )


class NutzerPfarreiRolle(Base):
    __tablename__ = "nutzer_pfarrei_rollen"
    __table_args__ = (UniqueConstraint("nutzer_id", "pfarrei_id", name="uq_nutzer_pfarrei"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    nutzer_id: Mapped[int] = mapped_column(ForeignKey("nutzer.id"))
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    rolle: Mapped[PfarreiRolle] = mapped_column(Enum(PfarreiRolle))

    nutzer: Mapped["Nutzer"] = relationship(back_populates="pfarrei_rollen")
    pfarrei: Mapped["Pfarrei"] = relationship(back_populates="nutzer_rollen")
