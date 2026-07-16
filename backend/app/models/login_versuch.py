from sqlalchemy import Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LoginVersuch(Base):
    """Ein einzelner Rate-Limit-Versuch für `app/rate_limit.py` - trotz des (historisch
    gewachsenen) Tabellennamens nicht auf den Login-Endpoint beschränkt, `aktion` unterscheidet
    die verschiedenen per Rate-Limit geschützten Aktionen (aktuell "login" und
    "einladung_annehmen") voneinander, damit sie sich nicht gegenseitig blockieren. Persistiert
    (statt nur im Prozessspeicher gehalten) übersteht der Zähler Neustarts und wird korrekt
    geteilt, falls die App jemals mit mehreren Worker-Prozessen läuft. `versucht_um` ist bewusst
    eine Unix-Zeit (`time.time()`) statt `time.monotonic()`, da Monotonic-Uhren nicht
    prozessübergreifend vergleichbar sind."""

    __tablename__ = "login_versuche"
    __table_args__ = (
        Index(
            "ix_login_versuche_aktion_client_ip_versucht_um", "aktion", "client_ip", "versucht_um"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_ip: Mapped[str] = mapped_column(String(64))
    versucht_um: Mapped[float] = mapped_column(Float)
    aktion: Mapped[str] = mapped_column(String(32), default="login", server_default="login")
