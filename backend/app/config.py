import logging
import os
import secrets
import time
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MINIPLAN_")

    database_url: str = "sqlite:///./miniplan.db"
    secret_key: str = ""
    secret_key_file: str | None = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    static_files_dir: str = "static"
    # Ablageort für hochgeladene Pfarrei-Bilder. Liegt bewusst außerhalb von static_files_dir
    # (Frontend-Build) im persistenten Datenverzeichnis; docker-compose setzt /data/media.
    media_dir: str = "media"
    # docker-compose.yml liefert standardmäßig reines HTTP aus; auf true setzen, sobald ein
    # TLS-Reverse-Proxy davorsteht, damit der Browser das Auth-Cookie nur noch über HTTPS sendet.
    cookie_secure: bool = False

    def model_post_init(self, __context: object) -> None:
        if self.secret_key:
            return
        if not self.secret_key_file:
            logger.warning(
                "MINIPLAN_SECRET_KEY_FILE ist nicht gesetzt, verwende einen öffentlich bekannten "
                "Entwicklungs-Secret-Key. Damit lassen sich JWTs für beliebige Nutzer fälschen – "
                "niemals so in einer erreichbaren Umgebung betreiben."
            )
            self.secret_key = "dev-secret-key-change-in-production"
            return

        self.secret_key = self._read_or_create_secret_key_file(Path(self.secret_key_file))

    @staticmethod
    def _read_or_create_secret_key_file(path: Path) -> str:
        # Exklusives Anlegen der Datei sorgt dafür, dass bei parallel startenden Prozessen
        # (mehrere Worker/Container gegen dasselbe Volume) nur einer den Key generiert; alle
        # anderen lesen den bereits geschriebenen Key, statt sich gegenseitig zu überschreiben.
        for _ in range(50):
            if path.is_file():
                content = path.read_text().strip()
                if content:
                    return content
                time.sleep(0.05)
                continue

            path.parent.mkdir(parents=True, exist_ok=True)
            key = secrets.token_hex(32)
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError:
                continue
            with os.fdopen(fd, "w") as f:
                f.write(key)
            return key

        raise RuntimeError(f"Secret-Key-Datei {path} konnte nicht gelesen oder erstellt werden.")


settings = Settings()
