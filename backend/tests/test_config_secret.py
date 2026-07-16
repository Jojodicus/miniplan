import pytest

from app.config import Settings


def test_ohne_secret_und_ohne_opt_in_wird_der_start_hart_abgebrochen(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ohne MINIPLAN_SECRET_KEY_FILE/MINIPLAN_SECRET_KEY und ohne das ausdrückliche
    MINIPLAN_ALLOW_DEV_SECRET-Opt-in darf die App nicht mit dem öffentlich bekannten
    Dev-Secret-Key starten (Issue #14) - das würde JWT-Fälschungen für beliebige Nutzer erlauben."""
    monkeypatch.delenv("MINIPLAN_ALLOW_DEV_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="MINIPLAN_ALLOW_DEV_SECRET"):
        Settings()


def test_ohne_secret_aber_mit_opt_in_startet_mit_dev_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MINIPLAN_ALLOW_DEV_SECRET", "1")

    settings = Settings()

    assert settings.secret_key == "dev-secret-key-change-in-production"


def test_expliziter_secret_key_startet_ohne_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MINIPLAN_ALLOW_DEV_SECRET", raising=False)

    settings = Settings(secret_key="ein-echter-produktions-schluessel")

    assert settings.secret_key == "ein-echter-produktions-schluessel"


def test_secret_key_file_startet_ohne_opt_in(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("MINIPLAN_ALLOW_DEV_SECRET", raising=False)
    secret_file = tmp_path / "secret_key"

    settings = Settings(secret_key_file=str(secret_file))

    assert settings.secret_key
    assert settings.secret_key != "dev-secret-key-change-in-production"
    assert secret_file.is_file()
