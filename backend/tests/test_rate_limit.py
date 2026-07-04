import pytest
from fastapi import Request

from app import rate_limit
from app.rate_limit import _attempts, enforce_login_rate_limit


def _make_request(client_host: str | None) -> Request:
    scope = {
        "type": "http",
        "client": (client_host, 12345) if client_host is not None else None,
        "headers": [],
    }
    return Request(scope)


def test_abgelaufene_ip_eintraege_werden_aus_dem_dict_entfernt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    zeit = [1_000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: zeit[0])

    enforce_login_rate_limit(_make_request("10.0.0.1"))
    assert "10.0.0.1" in _attempts

    zeit[0] += rate_limit._WINDOW_SECONDS + 1
    enforce_login_rate_limit(_make_request("10.0.0.2"))

    assert "10.0.0.1" not in _attempts
    assert "10.0.0.2" in _attempts


def test_anfragen_ohne_client_teilen_sich_einen_unknown_bucket() -> None:
    for _ in range(rate_limit._MAX_ATTEMPTS):
        enforce_login_rate_limit(_make_request(None))

    assert len(_attempts["unknown"]) == rate_limit._MAX_ATTEMPTS
