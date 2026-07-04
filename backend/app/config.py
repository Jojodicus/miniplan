import logging
import os
import secrets
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

        path = Path(self.secret_key_file)
        if path.is_file():
            self.secret_key = path.read_text().strip()
            return

        self.secret_key = secrets.token_hex(32)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.secret_key)
        os.chmod(path, 0o600)


settings = Settings()
