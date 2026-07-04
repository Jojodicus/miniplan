from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.nutzer import Nutzer, PfarreiRolle
from app.security import ACCESS_TOKEN_COOKIE_NAME, decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Nutzer:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Ungültige oder fehlende Anmeldedaten",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = token or request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
    if token is None:
        raise credentials_error
    nutzer_id = decode_access_token(token)
    if nutzer_id is None:
        raise credentials_error
    nutzer = db.get(Nutzer, nutzer_id)
    if nutzer is None:
        raise credentials_error
    return nutzer


def require_admin(current_user: Nutzer = Depends(get_current_user)) -> Nutzer:
    if not current_user.ist_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur für Admins zulässig",
        )
    return current_user


class RequirePfarreiRolle:
    """Erlaubt Zugriff für Admins sowie Nutzer mit einer der angegebenen Rollen in der jeweiligen Pfarrei."""

    def __init__(self, *erlaubte_rollen: PfarreiRolle):
        self.erlaubte_rollen = set(erlaubte_rollen)

    def __call__(
        self,
        pfarrei_id: int,
        current_user: Nutzer = Depends(get_current_user),
    ) -> Nutzer:
        if current_user.ist_admin:
            return current_user
        for zuordnung in current_user.pfarrei_rollen:
            if zuordnung.pfarrei_id == pfarrei_id and zuordnung.rolle in self.erlaubte_rollen:
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keine Berechtigung für diese Pfarrei",
        )
