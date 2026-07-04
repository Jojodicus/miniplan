from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FeiertagEinstellung(Base):
    __tablename__ = "feiertag_einstellungen"
    __table_args__ = (
        UniqueConstraint("pfarrei_id", "feiertag_key", name="uq_feiertag_einstellung_pfarrei_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pfarrei_id: Mapped[int] = mapped_column(ForeignKey("pfarreien.id"))
    feiertag_key: Mapped[str] = mapped_column(String(64))
    schulfrei: Mapped[bool] = mapped_column(Boolean, default=True)
    arbeiter_frei: Mapped[bool] = mapped_column(Boolean, default=False)
