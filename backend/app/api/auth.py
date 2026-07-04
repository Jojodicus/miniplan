from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.nutzer import Nutzer
from app.schemas.auth import LoginRequest, Token
from app.schemas.nutzer import NutzerOut
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> Token:
    nutzer = db.query(Nutzer).filter(Nutzer.email == payload.email).first()
    if nutzer is None or not verify_password(payload.password, nutzer.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-Mail oder Passwort ist falsch",
        )
    access_token = create_access_token(subject=nutzer.id)
    return Token(access_token=access_token)


@router.get("/me", response_model=NutzerOut)
def me(current_user: Nutzer = Depends(get_current_user)) -> Nutzer:
    return current_user
