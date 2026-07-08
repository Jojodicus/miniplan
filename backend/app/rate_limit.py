import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

# Großzügig genug, damit die wachsende Playwright-Suite (jeder E2E-Test loggt sich einmal ein,
# alle teilen sich beim parallelen Lauf dieselbe Client-IP im Docker-Netz) nicht an dieses
# eigentlich für Online-Brute-Force gegen echte Angreifer gedachte Limit stößt.
_MAX_ATTEMPTS = 30
_WINDOW_SECONDS = 60.0

_lock = threading.Lock()
_attempts: dict[str, list[float]] = defaultdict(list)


def enforce_login_rate_limit(request: Request) -> None:
    """Einfaches In-Memory-Rate-Limit pro Client-IP für den Login-Endpoint, um Online-Brute-Force
    gegen Passwörter zu erschweren. Wirkt nur innerhalb eines Prozesses (kein Redis o.ä.) –
    ausreichend, solange die App als einzelner Uvicorn-Prozess läuft (siehe docker-compose.yml)."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _lock:
        _attempts[client_ip] = [t for t in _attempts[client_ip] if now - t < _WINDOW_SECONDS]
        attempts = _attempts[client_ip]
        if len(attempts) >= _MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Zu viele Login-Versuche. Bitte später erneut versuchen.",
            )
        attempts.append(now)
        # Für alle IPs abgelaufene Versuche entfernen und komplett leere IPs aus dem Dict werfen,
        # damit dieser dauerhaft laufende Prozess nicht pro je gesehener Client-IP einen
        # permanenten (wenn auch irgendwann leeren) Eintrag behält.
        _prune_stale_ips(now)


def _prune_stale_ips(now: float) -> None:
    for ip in list(_attempts.keys()):
        _attempts[ip] = [t for t in _attempts[ip] if now - t < _WINDOW_SECONDS]
        if not _attempts[ip]:
            del _attempts[ip]
