import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api._helpers import get_or_404
from app.config import settings
from app.database import get_db
from app.deps import RequirePfarreiRolle, get_pfarrei
from app.models.einladung import Einladung
from app.models.nutzer import Nutzer, NutzerPfarreiRolle, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.rate_limit import enforce_einladung_annehmen_rate_limit
from app.schemas.auth import Token
from app.schemas.einladung import (
    EinladungAnnehmen,
    EinladungCreate,
    EinladungOut,
    EinladungVorschau,
)
from app.security import ACCESS_TOKEN_COOKIE_NAME, create_access_token, hash_password

# Rollen, die aktuell per Einladungslink vergeben werden dürfen - vorerst nur Betrachter,
# pfarrei_verantwortlicher bleibt Admin-/CLI-Sache.
ERLAUBTE_EINLADUNGS_ROLLEN = {PfarreiRolle.BETRACHTER}

router = APIRouter(prefix="/api/pfarreien/{pfarrei_id}/einladungen", tags=["einladungen"])
oeffentlicher_router = APIRouter(prefix="/api/einladungen", tags=["einladungen"])
require_verantwortlich = RequirePfarreiRolle(PfarreiRolle.PFARREI_VERANTWORTLICHER)


def _get_einladung_or_404(pfarrei_id: int, einladung_id: int, db: Session) -> Einladung:
    return get_or_404(db, Einladung, einladung_id, pfarrei_id=pfarrei_id)


def _ist_gueltig(einladung: Einladung, jetzt: datetime | None = None) -> bool:
    jetzt = jetzt or datetime.now(UTC)
    laeuft_ab_am = einladung.laeuft_ab_am
    if laeuft_ab_am.tzinfo is None:
        # SQLite gibt naive datetimes zurück (kein natives tz-aware DATETIME) - beide Seiten
        # des Vergleichs müssen daher gleich (naiv, UTC-Wanduhrzeit) behandelt werden.
        jetzt = jetzt.replace(tzinfo=None)
    return einladung.eingeloest_am is None and laeuft_ab_am > jetzt


@router.get("", response_model=list[EinladungOut])
def liste(
    pfarrei_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> list[Einladung]:
    jetzt = datetime.now(UTC).replace(tzinfo=None)
    alle = (
        db.query(Einladung)
        .filter(Einladung.pfarrei_id == pfarrei_id)
        .order_by(Einladung.erstellt_am.desc())
        .all()
    )
    return [e for e in alle if e.eingeloest_am is None and e.laeuft_ab_am > jetzt]


@router.post("", response_model=EinladungOut, status_code=status.HTTP_201_CREATED)
def erstellen(
    pfarrei_id: int,
    daten: EinladungCreate,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    current_user: Nutzer = Depends(require_verantwortlich),
) -> Einladung:
    if daten.rolle not in ERLAUBTE_EINLADUNGS_ROLLEN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Diese Rolle kann derzeit nicht per Einladungslink vergeben werden",
        )
    einladung = Einladung(
        token=secrets.token_urlsafe(32),
        pfarrei_id=pfarrei_id,
        rolle=daten.rolle,
        erstellt_von_id=current_user.id,
    )
    db.add(einladung)
    db.commit()
    db.refresh(einladung)
    return einladung


@router.delete("/{einladung_id}", status_code=status.HTTP_204_NO_CONTENT)
def widerrufen(
    pfarrei_id: int,
    einladung_id: int,
    db: Session = Depends(get_db),
    _pfarrei: Pfarrei = Depends(get_pfarrei),
    _=Depends(require_verantwortlich),
) -> None:
    einladung = _get_einladung_or_404(pfarrei_id, einladung_id, db)
    db.delete(einladung)
    db.commit()


@oeffentlicher_router.get("/{token}", response_model=EinladungVorschau)
def vorschau(token: str, db: Session = Depends(get_db)) -> EinladungVorschau:
    einladung = db.query(Einladung).filter(Einladung.token == token).first()
    if einladung is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Einladung nicht gefunden"
        )
    return EinladungVorschau(
        pfarrei_name=einladung.pfarrei.name,
        rolle=einladung.rolle,
        gueltig=_ist_gueltig(einladung),
    )


@oeffentlicher_router.post("/{token}/annehmen", response_model=Token)
def annehmen(
    token: str,
    daten: EinladungAnnehmen,
    response: Response,
    db: Session = Depends(get_db),
    _=Depends(enforce_einladung_annehmen_rate_limit),
) -> Token:
    einladung = db.query(Einladung).filter(Einladung.token == token).first()
    if einladung is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Einladung nicht gefunden"
        )
    if not _ist_gueltig(einladung):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Einladung ist abgelaufen oder bereits eingelöst",
        )

    email = daten.email.strip().lower()
    if db.query(Nutzer).filter(Nutzer.email == email).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ein Nutzer mit dieser E-Mail existiert bereits - bitte stattdessen anmelden",
        )

    nutzer = Nutzer(email=email, password_hash=hash_password(daten.password))
    db.add(nutzer)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ein Nutzer mit dieser E-Mail existiert bereits - bitte stattdessen anmelden",
        ) from None
    db.add(
        NutzerPfarreiRolle(
            nutzer_id=nutzer.id, pfarrei_id=einladung.pfarrei_id, rolle=einladung.rolle
        )
    )
    einladung.eingeloest_am = datetime.now(UTC)
    db.commit()
    db.refresh(nutzer)

    # Identischer Cookie-Setz-Code-Pfad wie POST /api/auth/login, damit sich das Verhalten nach
    # dem Annehmen einer Einladung nicht vom regulären Login unterscheidet.
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
