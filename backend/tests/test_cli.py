import pytest
from sqlalchemy.orm import Session

from app import cli
from app.models.dienst_typ import DienstTyp
from app.models.filtertag import Filtertag
from app.models.gruppe import Gruppe
from app.models.nutzer import Nutzer, NutzerPfarreiRolle, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.security import verify_password
from tests.conftest import TestSessionLocal


@pytest.fixture(autouse=True)
def _use_test_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "SessionLocal", TestSessionLocal)


def test_create_pfarrei(db_session: Session) -> None:
    cli.create_pfarrei("St. Beispiel")

    pfarrei = db_session.query(Pfarrei).filter(Pfarrei.name == "St. Beispiel").first()
    assert pfarrei is not None


def test_create_pfarrei_seedet_default_stammdaten(db_session: Session) -> None:
    cli.create_pfarrei("St. Beispiel")
    pfarrei = db_session.query(Pfarrei).filter(Pfarrei.name == "St. Beispiel").first()
    assert pfarrei is not None

    filtertag_keys = {
        f.key for f in db_session.query(Filtertag).filter(Filtertag.pfarrei_id == pfarrei.id)
    }
    assert filtertag_keys == {"grundschueler", "schueler", "arbeiter"}

    gruppen_namen = {
        g.name for g in db_session.query(Gruppe).filter(Gruppe.pfarrei_id == pfarrei.id)
    }
    assert gruppen_namen == {"Neu", "Normal", "Obermini"}

    dienst_typ_namen = {
        dt.name for dt in db_session.query(DienstTyp).filter(DienstTyp.pfarrei_id == pfarrei.id)
    }
    assert dienst_typ_namen == {
        "Sonntagsmesse",
        "Weihrauch",
        "Wochentagsmesse",
        "Alle Ministranten",
    }


def test_create_pfarrei_doppelt_schlaegt_fehl(db_session: Session) -> None:
    cli.create_pfarrei("St. Beispiel")
    with pytest.raises(SystemExit):
        cli.create_pfarrei("St. Beispiel")


def test_create_user_admin(db_session: Session) -> None:
    cli.create_user("admin@example.com", "geheim123", "admin", None)

    nutzer = db_session.query(Nutzer).filter(Nutzer.email == "admin@example.com").first()
    assert nutzer is not None
    assert nutzer.ist_admin is True
    assert verify_password("geheim123", nutzer.password_hash)


def test_create_user_pfarrei_rolle(db_session: Session) -> None:
    cli.create_pfarrei("St. Beispiel")
    cli.create_user(
        "verantwortlich@example.com", "geheim123", "pfarrei_verantwortlicher", "St. Beispiel"
    )

    nutzer = db_session.query(Nutzer).filter(Nutzer.email == "verantwortlich@example.com").first()
    assert nutzer is not None
    assert nutzer.ist_admin is False
    zuordnung = (
        db_session.query(NutzerPfarreiRolle)
        .filter(NutzerPfarreiRolle.nutzer_id == nutzer.id)
        .first()
    )
    assert zuordnung is not None
    assert zuordnung.rolle == PfarreiRolle.PFARREI_VERANTWORTLICHER


def test_create_user_ohne_pfarrei_schlaegt_fehl(db_session: Session) -> None:
    with pytest.raises(SystemExit):
        cli.create_user("betrachter@example.com", "geheim123", "betrachter", None)


def test_create_user_mit_unbekannter_pfarrei_schlaegt_fehl(db_session: Session) -> None:
    with pytest.raises(SystemExit):
        cli.create_user("betrachter@example.com", "geheim123", "betrachter", "Unbekannt")


def test_create_user_doppelte_email_schlaegt_fehl(db_session: Session) -> None:
    cli.create_user("admin@example.com", "geheim123", "admin", None)
    with pytest.raises(SystemExit):
        cli.create_user("admin@example.com", "anderes-pw", "admin", None)


def test_create_user_email_wird_normalisiert(db_session: Session) -> None:
    cli.create_user("Admin@Example.com", "geheim123", "admin", None)

    nutzer = db_session.query(Nutzer).filter(Nutzer.email == "admin@example.com").first()
    assert nutzer is not None

    with pytest.raises(SystemExit):
        cli.create_user("  ADMIN@EXAMPLE.COM  ", "anderes-pw", "admin", None)


def test_create_user_meldet_integrity_error_als_system_exit(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Simuliert eine Race Condition: die Existenzprüfung schlägt fälschlich negativ aus (z.B.
    weil ein anderer Prozess den Nutzer zwischen Prüfung und Commit angelegt hat). Der Commit
    muss den resultierenden IntegrityError sauber als SystemExit(1) melden statt eine rohe
    Exception durchzureichen."""
    db_session.add(Nutzer(email="admin@example.com", password_hash="platzhalter", ist_admin=True))
    db_session.commit()

    class _KeinTrefferQuery:
        def filter(self, *args: object, **kwargs: object) -> "_KeinTrefferQuery":
            return self

        def first(self) -> None:
            return None

    original_query = Session.query
    monkeypatch.setattr(
        Session,
        "query",
        lambda self, model: _KeinTrefferQuery() if model is Nutzer else original_query(self, model),
    )

    with pytest.raises(SystemExit):
        cli.create_user("admin@example.com", "anderes-pw", "admin", None)
