import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MINIPLAN_")

    database_url: str = "sqlite:///./miniplan.db"
    secret_key: str = ""
    secret_key_file: str | None = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    static_files_dir: str = "static"

    def model_post_init(self, __context: object) -> None:
        if self.secret_key:
            return
        if not self.secret_key_file:
            self.secret_key = "dev-secret-key-change-in-production"
            return

        path = Path(self.secret_key_file)
        if path.is_file():
            self.secret_key = path.read_text().strip()
            return

        self.secret_key = secrets.token_hex(32)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.secret_key)


settings = Settings()
