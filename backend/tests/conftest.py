from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.nutzer import Nutzer, NutzerPfarreiRolle, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.security import hash_password

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def _reset_db() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


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


def auth_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
