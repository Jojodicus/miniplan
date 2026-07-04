import stat
from pathlib import Path

from app.config import Settings


def test_secret_key_wird_generiert_und_persistiert(tmp_path: Path) -> None:
    secret_file = tmp_path / "secret_key"

    erster_start = Settings(secret_key_file=str(secret_file))
    assert erster_start.secret_key
    assert secret_file.is_file()

    zweiter_start = Settings(secret_key_file=str(secret_file))
    assert zweiter_start.secret_key == erster_start.secret_key


def test_generierte_secret_key_datei_ist_nur_fuer_besitzer_lesbar(tmp_path: Path) -> None:
    secret_file = tmp_path / "secret_key"

    Settings(secret_key_file=str(secret_file))

    mode = stat.S_IMODE(secret_file.stat().st_mode)
    assert mode == 0o600


def test_explizit_gesetzter_secret_key_hat_vorrang(tmp_path: Path) -> None:
    secret_file = tmp_path / "secret_key"

    settings = Settings(secret_key="mein-fester-schluessel", secret_key_file=str(secret_file))

    assert settings.secret_key == "mein-fester-schluessel"
    assert not secret_file.exists()


def test_ohne_secret_key_file_wird_dev_default_verwendet() -> None:
    settings = Settings()
    assert settings.secret_key == "dev-secret-key-change-in-production"
