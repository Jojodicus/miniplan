from typing import TYPE_CHECKING

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.bundesland import Bundesland

if TYPE_CHECKING:
    from app.models.nutzer import NutzerPfarreiRolle


class Pfarrei(Base):
    __tablename__ = "pfarreien"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    bundesland: Mapped[Bundesland] = mapped_column(Enum(Bundesland), default=Bundesland.BY)

    nutzer_rollen: Mapped[list["NutzerPfarreiRolle"]] = relationship(
        back_populates="pfarrei", cascade="all, delete-orphan"
    )
