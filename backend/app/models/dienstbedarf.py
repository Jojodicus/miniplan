from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.dienst_typ import DienstTyp
    from app.models.gottesdienst import Gottesdienst
    from app.models.gruppe import Gruppe
    from app.models.mini import Mini


class Dienstbedarf(Base):
    __tablename__ = "dienstbedarf"

    id: Mapped[int] = mapped_column(primary_key=True)
    gottesdienst_id: Mapped[int] = mapped_column(ForeignKey("gottesdienste.id", ondelete="CASCADE"))
    # SET NULL statt CASCADE: dienst_typ_id ist nur eine Ableitungs-Referenz, Anzahl und
    # Gruppen-Anforderungen werden beim Anlegen als eigene Kopie übernommen (siehe CLAUDE.md) -
    # ein gelöschter DienstTyp soll bestehende Dienstbedarf-Einträge nicht mitlöschen.
    dienst_typ_id: Mapped[int | None] = mapped_column(
        ForeignKey("dienst_typen.id", ondelete="SET NULL"), default=None
    )
    name: Mapped[str | None] = mapped_column(String(255), default=None)
    anzahl: Mapped[int] = mapped_column(Integer)
    erforderliche_filtertags: Mapped[list[str]] = mapped_column(JSON, default=list)
    zeige_label: Mapped[bool] = mapped_column(Boolean, default=True)

    gottesdienst: Mapped["Gottesdienst"] = relationship(back_populates="dienstbedarf")
    dienst_typ: Mapped["DienstTyp | None"] = relationship()
    gruppen_anforderungen: Mapped[list["DienstbedarfGruppenAnforderung"]] = relationship(
        back_populates="dienstbedarf", cascade="all, delete-orphan"
    )
    zuweisungen: Mapped[list["DienstbedarfZuweisung"]] = relationship(
        back_populates="dienstbedarf", cascade="all, delete-orphan"
    )

    @property
    def zugewiesene_minis(self) -> list["Mini"]:
        return [zuweisung.mini for zuweisung in self.zuweisungen]


class DienstbedarfGruppenAnforderung(Base):
    __tablename__ = "dienstbedarf_gruppen_anforderungen"
    __table_args__ = (
        UniqueConstraint(
            "dienstbedarf_id", "gruppe_id", name="uq_dienstbedarf_gruppen_anforderung"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dienstbedarf_id: Mapped[int] = mapped_column(ForeignKey("dienstbedarf.id", ondelete="CASCADE"))
    gruppe_id: Mapped[int] = mapped_column(ForeignKey("gruppen.id", ondelete="CASCADE"))
    mindest_anzahl: Mapped[int] = mapped_column(Integer, default=0)

    dienstbedarf: Mapped["Dienstbedarf"] = relationship(back_populates="gruppen_anforderungen")
    gruppe: Mapped["Gruppe"] = relationship()


class DienstbedarfZuweisung(Base):
    __tablename__ = "dienstbedarf_zuweisungen"
    __table_args__ = (
        UniqueConstraint("dienstbedarf_id", "mini_id", name="uq_dienstbedarf_zuweisung"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dienstbedarf_id: Mapped[int] = mapped_column(ForeignKey("dienstbedarf.id", ondelete="CASCADE"))
    mini_id: Mapped[int] = mapped_column(ForeignKey("minis.id", ondelete="CASCADE"))
    manuell_fixiert: Mapped[bool] = mapped_column(Boolean, default=True)

    dienstbedarf: Mapped["Dienstbedarf"] = relationship(back_populates="zuweisungen")
    mini: Mapped["Mini"] = relationship()
