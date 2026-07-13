from datetime import date, time
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.dienstbedarf import Dienstbedarf
    from app.models.miniplan import Miniplan


class Gottesdienst(Base):
    __tablename__ = "gottesdienste"

    id: Mapped[int] = mapped_column(primary_key=True)
    miniplan_id: Mapped[int] = mapped_column(ForeignKey("miniplaene.id", ondelete="CASCADE"))
    datum: Mapped[date] = mapped_column(Date)
    uhrzeit: Mapped[time] = mapped_column(Time)
    name: Mapped[str | None] = mapped_column(String(255), default=None)
    notiz: Mapped[str | None] = mapped_column(Text, default=None)

    miniplan: Mapped["Miniplan"] = relationship(back_populates="gottesdienste")
    # `order_by` ist hier kein Komfort, sondern nötig für Korrektheit: das Frontend matcht die
    # Antwort von `PUT .../gottesdienste/{id}` positionsbasiert gegen die gesendete `bedarfListe`
    # (um neu vergebene IDs/Server-Zuweisungen zuzuordnen, siehe MiniplanEditorPage). Ohne feste
    # Sortierung ist die von SQLAlchemy zurückgegebene Reihenfolge nicht garantiert stabil, was zu
    # einer falschen Zuordnung führen kann - mit dem sichtbaren Symptom, dass ein Dienstbedarf nach
    # dem nächsten Speichern falsche Zuweisungen/Anzahl trägt und dauerhaft nicht mehr passend
    # gefüllt wird.
    dienstbedarf: Mapped[list["Dienstbedarf"]] = relationship(
        back_populates="gottesdienst", cascade="all, delete-orphan", order_by="Dienstbedarf.id"
    )
