from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.nutzer import Nutzer
from app.rate_limit import enforce_login_rate_limit
from app.schemas.auth import LoginRequest, Token
from app.schemas.nutzer import NutzerOut
from app.security import (
    ACCESS_TOKEN_COOKIE_NAME,
    create_access_token,
    verify_password_or_dummy,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token, dependencies=[Depends(enforce_login_rate_limit)])
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> Token:
    nutzer = db.query(Nutzer).filter(Nutzer.email == payload.email).first()
    password_hash = nutzer.password_hash if nutzer is not None else None
    passwort_korrekt = verify_password_or_dummy(payload.password, password_hash)
    if nutzer is None or not passwort_korrekt:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-Mail oder Passwort ist falsch",
        )
    access_token = create_access_token(subject=nutzer.id)
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return Token(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(key=ACCESS_TOKEN_COOKIE_NAME, path="/")


@router.get("/me", response_model=NutzerOut)
def me(current_user: Nutzer = Depends(get_current_user)) -> Nutzer:
    return current_user
