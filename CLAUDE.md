# Miniplan

Selbst gehostete App für die Ministranten-Dienstplanung einer Pfarrei ("Miniplan"). Erstellen,
automatisches Füllen und Veröffentlichen der monatlichen Dienstpläne, inkl. Typst-PDF-Rendering
und Token-basiertem Self-Service für Ministranten.

## Stack

- **Backend:** Python (FastAPI), SQLAlchemy + Alembic, SQLite
- **Frontend:** React + Vite (TypeScript), react-router-dom, Paketmanager pnpm
- **Auth:** Username/Passwort + JWT (im httpOnly-Cookie, alternativ per `Authorization: Bearer`-Header)
- **Deployment:** ein Docker-Container (Frontend-Build wird vom Backend als Static Files
  ausgeliefert), Typst-Binary im Image

## Verzeichnisstruktur

```
backend/
  app/
    api/          FastAPI-Router (auth, pfarreien, ...)
    models/       SQLAlchemy-Modelle
    schemas/      Pydantic-Schemas für Request/Response
    config.py     Settings (aus Umgebungsvariablen mit Präfix MINIPLAN_); generiert und persistiert
                  den JWT-Secret-Key automatisch in MINIPLAN_SECRET_KEY_FILE, falls kein
                  MINIPLAN_SECRET_KEY gesetzt ist
    database.py   Engine/Session/Base, get_db-Dependency
    security.py   Passwort-Hashing (bcrypt), JWT-Erstellung/-Validierung
    deps.py       Auth-Dependencies (get_current_user, require_admin, RequirePfarreiRolle)
    rate_limit.py In-Memory-Rate-Limit pro Client-IP für den Login-Endpoint (gilt nur pro
                  Prozess, siehe Deployment-Hinweis dort)
    cli.py        Kommandozeilen-Nutzer-/Pfarrei-Erstellung
    main.py       FastAPI-App, Security-Header-Middleware, `/api/health`, Router-Registrierung,
                  Static-File-Ausliefertung inkl. SPA-Fallback (client-seitige Routen wie /login
                  funktionieren auch bei direktem Aufruf)
  alembic/        Migrationen
  tests/          Pytest-Suite (pytest.ini_options in pyproject.toml), läuft komplett gegen eine
                  In-Memory-SQLite-DB (siehe tests/conftest.py) – keine temporären Dateien
frontend/
  src/
    api/          Fetch-basierter API-Client
    auth/         AuthContext (Login-Status; Token liegt in einem httpOnly-Cookie, das das
                  Backend beim Login setzt – kein clientseitiger Zugriff auf den Token)
    pages/        Seiten-Komponenten (Login, Dashboard, ...)
  e2e/            Playwright-Tests; global-setup.ts/global-teardown.ts bauen/starten bzw. stoppen
                  den echten Docker-Container (docker-compose.e2e.yml) automatisch
Dockerfile              Multi-Stage-Build: Frontend-Build -> Backend-Image (inkl. Typst-Binary),
                        HEALTHCHECK gegen /api/health
docker-compose.yml      Deployment: ein Service, SQLite + Secret-Key-Datei im Volume /data
docker-compose.e2e.yml  isolierte Variante für Playwright-E2E-Tests (eigener Port 8100, tmpfs
                        statt Volume, seedet Testdaten beim Start noch vor dem Öffnen des Ports)
```

## Datenmodell (Auth-Kern)

- **Pfarrei**: Name
- **Nutzer**: E-Mail, Passwort-Hash, `ist_admin` (globale Admin-Rolle)
- **NutzerPfarreiRolle**: verknüpft Nutzer + Pfarrei mit einer pfarrei-bezogenen Rolle
  (`pfarrei_verantwortlicher`, `betrachter`); ein Nutzer kann in mehreren Pfarreien unterschiedliche
  Rollen haben. Admins sind global und benötigen keinen Eintrag hier.

Rollen-Autorisierung: `app/deps.py` stellt `require_admin` (nur globale Admins) und
`RequirePfarreiRolle(*rollen)` (Admins oder Nutzer mit passender Rolle in der per Pfad-Parameter
`pfarrei_id` übergebenen Pfarrei) als FastAPI-Dependencies bereit.

## Befehle

**Backend (aus `backend/`):**
```
uv venv .venv && uv pip install -e ".[dev]" --python .venv/bin/python   # Setup
.venv/bin/alembic upgrade head                                          # Migrationen anwenden
.venv/bin/alembic revision --autogenerate -m "..."                      # neue Migration
.venv/bin/uvicorn app.main:app --reload                                 # Dev-Server
.venv/bin/pytest                                                        # Tests
.venv/bin/python -m app.cli create-pfarrei --name "..."
.venv/bin/python -m app.cli create-user --email ... --password ... --role admin|pfarrei_verantwortlicher|betrachter [--pfarrei "..."]
```

**Frontend (aus `frontend/`):**
```
pnpm install
pnpm run dev                 # Dev-Server (Port 5173, proxied /api -> localhost:8000)
pnpm run build                # tsc -b && vite build
pnpm exec playwright test     # E2E-Tests gegen echten Docker-Container (Port 8100), inkl.
                              # automatischem Build/Start/Seed/Cleanup, siehe playwright.config.ts
```

**Docker (aus Repo-Root):**
```
docker compose up --build                                        # Deployment
docker exec <container> python -m app.cli create-user --email ... --role admin
docker compose -p miniplan-e2e -f docker-compose.e2e.yml up -d --build   # manuell wie im E2E-Test
```

## Konventionen

- Strikte Trennung Routing (`api/`) / Datenzugriff (`models/`) / Request-Response-Schemas
  (`schemas/`); Business-Logik-Services kommen in `app/services/`, sobald sie gebraucht werden.
- Rollen-Prüfung ausschließlich über die Dependencies in `deps.py`, nicht in Einzel-Endpunkten neu
  implementieren.
- Frontend: API-Zugriff nur über `src/api/`, Komponenten in `src/pages/` bleiben UI-fokussiert.
- Jede neue Funktionalität bekommt Pytest- (Backend) bzw. Playwright-Tests (Frontend-Workflows) im
  selben Arbeitsschritt.
- Tests hinterlassen keine temporären Dateien oder Container: Backend-Tests laufen gegen eine
  In-Memory-DB, die E2E-Docker-Umgebung wird über `globalSetup`/`globalTeardown` in
  `frontend/playwright.config.ts` auch bei Testfehlern zuverlässig wieder abgebaut.
