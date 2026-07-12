from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.config import settings

ACCESS_TOKEN_COOKIE_NAME = "miniplan_token"


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


_DUMMY_HASH = hash_password("dummy-password")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def verify_password_or_dummy(plain_password: str, password_hash: str | None) -> bool:
    """Führt immer einen bcrypt-Vergleich durch, auch wenn kein Nutzer existiert, damit die
    Login-Antwortzeit nicht verrät, ob eine E-Mail-Adresse registriert ist."""
    return verify_password(plain_password, password_hash or _DUMMY_HASH)


def create_access_token(subject: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(subject), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except InvalidTokenError:
        return None
    subject = payload.get("sub")
    if subject is None:
        return None
    return int(subject)
