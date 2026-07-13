from collections.abc import Generator
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


def enable_sqlite_foreign_keys(engine: Engine) -> None:
    """Aktiviert FK-Constraint-Erzwingung für eine SQLite-Engine (per Default aus) - ohne das
    würden ON DELETE CASCADE/SET NULL in den Modellen (siehe app/models/) nicht greifen und
    gelöschte Eltern-Zeilen verwaiste Kind-Zeilen hinterlassen. Muss auch für Test- und andere
    zusätzliche SQLite-Engines (siehe tests/conftest.py) aufgerufen werden, nicht nur für die
    App-Engine hier."""

    @event.listens_for(engine, "connect")
    def _sqlite_enforce_foreign_keys(dbapi_connection: Any, connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)

if settings.database_url.startswith("sqlite"):
    enable_sqlite_foreign_keys(engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
