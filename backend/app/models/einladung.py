from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.nutzer import PfarreiRolle

if TYPE_CHECKING:
    from app.models.nutzer import Nutzer
    from app.models.pfarrei import Pfarrei

STANDARD_GUELTIGKEIT = timedelta(days=7)


def _default_laeuft_ab_am() -> datetime:
    return datetime.now(UTC) + STANDARD_GUELTIGKEIT


class Einladung(Base):
    """Ein einmaliger Einladungslink, mit dem ein `pfarrei_verantwortlicher` ohne CLI-/Admin-
    Zugriff einen neuen Betrachter-Account für seine Pfarrei erstellen lassen kann.
    Welche Rollen erlaubt sind wird bewusst nicht per DB-Constraint, sondern in der API-Schicht
    geprüft (`api/einladungen.py`) - aktuell nur `betrachter`, aber ohne Schema-Änderung
    erweiterbar."""

    __tablename__ = "einladungen"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id", ondelete="CASCADE"))
    rolle: Mapped[PfarreiRolle] = mapped_column(Enum(PfarreiRolle))
    erstellt_von_id: Mapped[int] = mapped_column(ForeignKey("nutzer.id", ondelete="CASCADE"))
    erstellt_am: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    laeuft_ab_am: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_default_laeuft_ab_am
    )
    eingeloest_am: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    pfarrei: Mapped["Pfarrei"] = relationship()
    erstellt_von: Mapped["Nutzer"] = relationship()
