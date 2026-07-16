import os
from collections.abc import Generator

# Muss vor jedem `app.*`-Import gesetzt werden, da `app.config.settings` beim ersten Import
# einmalig aus den Umgebungsvariablen gebaut wird. Ein niedriger bcrypt-Kostenfaktor spart in der
# Suite mehrere hundert bcrypt-Hashes à ~170ms (Default-Kostenfaktor 12) ein.
os.environ.setdefault("MINIPLAN_BCRYPT_ROUNDS", "4")
# Ohne MINIPLAN_SECRET_KEY_FILE/MINIPLAN_SECRET_KEY bricht app.config.Settings seit Issue #14 hart
# ab (siehe dortiger Kommentar) - die Suite selbst läuft aber bewusst ohne konfigurierten Secret,
# daher hier ausdrücklich das Opt-in setzen, das die Test-/Dev-Ausnahme aktiviert.
os.environ.setdefault("MINIPLAN_ALLOW_DEV_SECRET", "1")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, enable_sqlite_foreign_keys, get_db
from app.main import app
from app.models.filtertag import Filtertag
from app.models.gruppe import Gruppe
from app.models.nutzer import Nutzer, NutzerPfarreiRolle, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.security import hash_password
from app.services import ferien_sync

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
enable_sqlite_foreign_keys(engine)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def _reset_db() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


# Referenz auf die echte Implementierung, bevor der Autouse-Stub unten sie ersetzt - für Tests,
# die (wie test_ferien_fuer_jahr_wird_fuer_ttl_gecached) genau diese Funktion selbst prüfen wollen.
echte_ferien_fuer_jahr = ferien_sync._ferien_fuer_jahr


@pytest.fixture(autouse=True)
def _keine_echten_ferien_api_aufrufe(monkeypatch: pytest.MonkeyPatch) -> None:
    """`fuellen` und `bundesland_setzen` rufen `sync_ferien` best-effort auf - ohne diesen Stub
    würde jeder entsprechende Test eine echte Anfrage an ferien-api.de auslösen (langsam,
    netzwerkabhängig, nicht deterministisch). Tests, die die echte Sync-Logik prüfen wollen,
    überschreiben `_ferien_fuer_jahr` selbst wieder."""
    monkeypatch.setattr(ferien_sync, "_ferien_fuer_jahr", lambda *a, **k: [])


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def pfarrei(db_session: Session) -> Pfarrei:
    obj = Pfarrei(name="St. Beispiel")
    db_session.add(obj)
    db_session.commit()
    db_session.refresh(obj)
    return obj


def _create_user(
    db_session: Session,
    email: str,
    password: str,
    ist_admin: bool = False,
) -> Nutzer:
    nutzer = Nutzer(email=email, password_hash=hash_password(password), ist_admin=ist_admin)
    db_session.add(nutzer)
    db_session.commit()
    db_session.refresh(nutzer)
    return nutzer


@pytest.fixture
def admin_user(db_session: Session) -> Nutzer:
    return _create_user(db_session, "admin@example.com", "geheim123", ist_admin=True)


@pytest.fixture
def verantwortlicher_user(db_session: Session, pfarrei: Pfarrei) -> Nutzer:
    nutzer = _create_user(db_session, "verantwortlich@example.com", "geheim123")
    db_session.add(
        NutzerPfarreiRolle(
            nutzer_id=nutzer.id,
            pfarrei_id=pfarrei.id,
            rolle=PfarreiRolle.PFARREI_VERANTWORTLICHER,
        )
    )
    db_session.commit()
    db_session.refresh(nutzer)
    return nutzer


@pytest.fixture
def betrachter_user(db_session: Session, pfarrei: Pfarrei) -> Nutzer:
    nutzer = _create_user(db_session, "betrachter@example.com", "geheim123")
    db_session.add(
        NutzerPfarreiRolle(
            nutzer_id=nutzer.id,
            pfarrei_id=pfarrei.id,
            rolle=PfarreiRolle.BETRACHTER,
        )
    )
    db_session.commit()
    db_session.refresh(nutzer)
    return nutzer


@pytest.fixture
def gruppe(db_session: Session, pfarrei: Pfarrei) -> Gruppe:
    obj = Gruppe(pfarrei_id=pfarrei.id, name="Obermini")
    db_session.add(obj)
    db_session.commit()
    db_session.refresh(obj)
    return obj


@pytest.fixture
def filtertags(db_session: Session, pfarrei: Pfarrei) -> dict[str, Filtertag]:
    """Legt die drei Standard-Filtertags für `pfarrei` an (wie `seed_default_stammdaten`), damit
    Tests, die z.B. "arbeiter" als Filtertag-Key verwenden, gegen eine gültige Referenz
    validieren."""
    definitionen = [
        ("grundschueler", "Grundschüler", True),
        ("schueler", "Schüler", True),
        ("arbeiter", "Arbeiter", False),
    ]
    ergebnis: dict[str, Filtertag] = {}
    for key, label, ist_schueler_artig in definitionen:
        obj = Filtertag(
            pfarrei_id=pfarrei.id, key=key, label=label, ist_schueler_artig=ist_schueler_artig
        )
        db_session.add(obj)
        ergebnis[key] = obj
    db_session.commit()
    for obj in ergebnis.values():
        db_session.refresh(obj)
    return ergebnis


def auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
