import time

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.login_versuch import LoginVersuch

# Großzügig genug, damit die wachsende Playwright-Suite (jeder E2E-Test loggt sich einmal ein,
# alle teilen sich beim parallelen Lauf dieselbe Client-IP im Docker-Netz) nicht an dieses
# eigentlich für Online-Brute-Force gegen echte Angreifer gedachte Limit stößt.
_MAX_ATTEMPTS = 30
_WINDOW_SECONDS = 60.0


def _enforce_rate_limit(
    request: Request,
    db: Session,
    aktion: str,
    fehlermeldung: str,
) -> None:
    """Gemeinsame Rate-Limit-Logik, pro Client-IP *und* Aktion gezählt (siehe `LoginVersuch.aktion`)
    - ein Client soll durch viele Versuche einer Aktion nicht auch das Limit einer anderen Aktion
    verbrauchen. `db` wird über dieselbe `get_db`-Dependency wie der eigentliche Handler aufgelöst,
    FastAPI löst sie pro Request also nur einmal auf (Dependency-Caching) - kein zusätzlicher
    Verbindungsaufbau."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    grenze = now - _WINDOW_SECONDS

    # Über alle IPs und Aktionen abgelaufene Einträge entfernen, damit die Tabelle nicht unbegrenzt
    # wächst - jeder Versuch prunt bei dieser Gelegenheit gleich mit.
    db.query(LoginVersuch).filter(LoginVersuch.versucht_um < grenze).delete(
        synchronize_session=False
    )

    aktuelle_versuche = (
        db.query(LoginVersuch)
        .filter(
            LoginVersuch.aktion == aktion,
            LoginVersuch.client_ip == client_ip,
            LoginVersuch.versucht_um >= grenze,
        )
        .count()
    )
    if aktuelle_versuche >= _MAX_ATTEMPTS:
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=fehlermeldung,
        )

    db.add(LoginVersuch(client_ip=client_ip, versucht_um=now, aktion=aktion))
    db.commit()


def enforce_login_rate_limit(request: Request, db: Session = Depends(get_db)) -> None:
    """DB-gestütztes Rate-Limit pro Client-IP für den Login-Endpoint, um Online-Brute-Force gegen
    Passwörter zu erschweren. Der Zähler liegt in der `login_versuche`-Tabelle statt nur im
    Prozessspeicher (siehe app/models/login_versuch.py) - übersteht dadurch Neustarts und
    funktioniert korrekt, falls die App jemals mit mehreren Worker-Prozessen läuft."""
    _enforce_rate_limit(
        request,
        db,
        aktion="login",
        fehlermeldung="Zu viele Login-Versuche. Bitte später erneut versuchen.",
    )


def enforce_einladung_annehmen_rate_limit(request: Request, db: Session = Depends(get_db)) -> None:
    """Wie `enforce_login_rate_limit`, aber für das unauthentifizierte Annehmen einer Einladung
    (POST /api/einladungen/{token}/annehmen legt einen neuen Nutzer-Account an) - ohne dieses Limit
    ließe sich der Endpoint als unthrottelter Account-Erstellungs-Spam-Vektor missbrauchen."""
    _enforce_rate_limit(
        request,
        db,
        aktion="einladung_annehmen",
        fehlermeldung="Zu viele Versuche. Bitte später erneut versuchen.",
    )
