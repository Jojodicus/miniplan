from typing import TYPE_CHECKING

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.bundesland import Bundesland

if TYPE_CHECKING:
    from app.models.nutzer import NutzerPfarreiRolle


class Pfarrei(Base):
    __tablename__ = "pfarreien"
    # Erzwingt in SQLite eine strikt monoton steigende ID (statt der niedrigsten freien Zahl) -
    # Pfarrei-IDs werden ansonsten nach dem Löschen einer Pfarrei wiederverwendet, was zu
    # Unique-Constraint-Konflikten führen kann, falls irgendwo doch verwaiste Zeilen übrig
    # bleiben (siehe pfarrei_loeschen in api/admin.py).
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    bundesland: Mapped[Bundesland] = mapped_column(Enum(Bundesland), default=Bundesland.BY)
    # Dateiname des im media_dir abgelegten Pfarrei-Bilds (inkl. Endung), None = kein Bild.
    bild_dateiname: Mapped[str | None] = mapped_column(String(255), default=None)

    nutzer_rollen: Mapped[list["NutzerPfarreiRolle"]] = relationship(
        back_populates="pfarrei", cascade="all, delete-orphan"
    )
