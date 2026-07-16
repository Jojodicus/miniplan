import pytest
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app import rate_limit
from app.models.login_versuch import LoginVersuch
from app.rate_limit import enforce_einladung_annehmen_rate_limit, enforce_login_rate_limit


def _make_request(client_host: str | None) -> Request:
    scope = {
        "type": "http",
        "client": (client_host, 12345) if client_host is not None else None,
        "headers": [],
    }
    return Request(scope)


def test_anfragen_unter_dem_limit_werden_erlaubt(db_session: Session) -> None:
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request("10.0.0.1"), db=db_session)

    anzahl = db_session.query(LoginVersuch).filter(LoginVersuch.client_ip == "10.0.0.1").count()
    assert anzahl == rate_limit._MAX_ATTEMPTS


def test_anfragen_ueber_dem_limit_werden_mit_429_blockiert(db_session: Session) -> None:
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request("10.0.0.2"), db=db_session)

    with pytest.raises(HTTPException) as exc_info:
        enforce_login_rate_limit(_make_request("10.0.0.2"), db=db_session)
    assert exc_info.value.status_code == 429


def test_ips_haben_unabhaengige_zaehler(db_session: Session) -> None:
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request("10.0.0.3"), db=db_session)
    with pytest.raises(HTTPException):
        enforce_login_rate_limit(_make_request("10.0.0.3"), db=db_session)

    # Andere IP ist von der Sperre der ersten unberührt.
    enforce_login_rate_limit(_make_request("10.0.0.4"), db=db_session)


def test_anfragen_ohne_client_teilen_sich_einen_unknown_bucket(db_session: Session) -> None:
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request(None), db=db_session)

    anzahl = db_session.query(LoginVersuch).filter(LoginVersuch.client_ip == "unknown").count()
    assert anzahl == rate_limit._MAX_ATTEMPTS

    with pytest.raises(HTTPException):
        enforce_login_rate_limit(_make_request(None), db=db_session)


def test_nach_ablauf_des_zeitfensters_wird_die_ip_wieder_erlaubt(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    zeit = [1_000.0]
    monkeypatch.setattr(rate_limit.time, "time", lambda: zeit[0])

    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request("10.0.0.5"), db=db_session)
    with pytest.raises(HTTPException):
        enforce_login_rate_limit(_make_request("10.0.0.5"), db=db_session)

    zeit[0] += rate_limit._WINDOW_SECONDS + 1
    # Alle bisherigen Versuche liegen jetzt außerhalb des Fensters - sollte wieder erlaubt sein.
    enforce_login_rate_limit(_make_request("10.0.0.5"), db=db_session)


def test_einladung_annehmen_ueber_dem_limit_wird_mit_429_blockiert(db_session: Session) -> None:
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_einladung_annehmen_rate_limit(_make_request("10.0.0.8"), db=db_session)

    with pytest.raises(HTTPException) as exc_info:
        enforce_einladung_annehmen_rate_limit(_make_request("10.0.0.8"), db=db_session)
    assert exc_info.value.status_code == 429


def test_login_und_einladung_annehmen_haben_unabhaengige_zaehler_fuer_dieselbe_ip(
    db_session: Session,
) -> None:
    # Ausschöpfen des Login-Limits einer IP darf das Annehmen einer Einladung von derselben IP
    # nicht blockieren (und umgekehrt) - beide Aktionen teilen sich dieselbe Tabelle, aber zählen
    # unabhängig anhand von `LoginVersuch.aktion`.
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request("10.0.0.9"), db=db_session)
    with pytest.raises(HTTPException):
        enforce_login_rate_limit(_make_request("10.0.0.9"), db=db_session)

    enforce_einladung_annehmen_rate_limit(_make_request("10.0.0.9"), db=db_session)


def test_abgelaufene_eintraege_werden_aus_der_tabelle_entfernt(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    zeit = [1_000.0]
    monkeypatch.setattr(rate_limit.time, "time", lambda: zeit[0])

    enforce_login_rate_limit(_make_request("10.0.0.6"), db=db_session)
    assert db_session.query(LoginVersuch).filter(LoginVersuch.client_ip == "10.0.0.6").count() == 1

    zeit[0] += rate_limit._WINDOW_SECONDS + 1
    enforce_login_rate_limit(_make_request("10.0.0.7"), db=db_session)

    # Der abgelaufene Eintrag der ersten IP wurde beim Prune-Schritt entfernt, nicht nur ignoriert.
    assert db_session.query(LoginVersuch).filter(LoginVersuch.client_ip == "10.0.0.6").count() == 0
    assert db_session.query(LoginVersuch).filter(LoginVersuch.client_ip == "10.0.0.7").count() == 1
