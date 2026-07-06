# Miniplan

Selbst gehostete Web-App zur Verwaltung des monatlichen Ministranten-Dienstplans ("Miniplan")
einer Pfarrei: Pläne erstellen, automatisch fair zuteilen, als PDF (Typst) rendern und
veröffentlichen. Rollen für Admins und Pfarrei-Verantwortliche, anonymer Token-Zugang für
Ministranten zur Pflege ihrer Verfügbarkeiten.

Stack: FastAPI + SQLAlchemy/Alembic + SQLite (Backend), React + Vite/TypeScript (Frontend),
ausgeliefert als ein einziger Docker-Container.

## Aufsetzen

```bash
docker compose up --build
```

Danach ist die App unter `http://localhost:8000` erreichbar. Ersten Admin-Nutzer anlegen:

```bash
docker exec miniplan python -m app.cli create-pfarrei --name "Meine Pfarrei"
docker exec miniplan python -m app.cli create-user \
  --email admin@example.com --password geheim123 --role admin
```

Für lokale Backend-/Frontend-Entwicklung ohne Docker siehe [`CLAUDE.md`](CLAUDE.md).

## Betrieb hinter einem Reverse Proxy (Caddy, Nginx Proxy Manager, ...)

Beim Deployment hinter einem Reverse Proxy zwei Umgebungsvariablen setzen:

```yaml
environment:
  MINIPLAN_COOKIE_SECURE: "true"       # sobald TLS am Proxy terminiert
  UVICORN_FORWARDED_ALLOW_IPS: "*"     # oder die IP/das Docker-Netz des Proxys
```

CORS-Konfiguration ist nicht nötig, da Frontend und API immer über dieselbe Origin
ausgeliefert werden.

## Testen

**Backend (Pytest, läuft komplett gegen eine In-Memory-DB):**

```bash
cd backend
uv venv .venv && uv pip install -e ".[dev]" --python .venv/bin/python
.venv/bin/pytest
```

**Frontend-Workflows (Playwright, End-to-End gegen den echten Docker-Container):**

```bash
cd frontend
pnpm install
pnpm exec playwright test
```

Der Testlauf baut und startet den Docker-Container automatisch isoliert (Port 8100, eigenes
Docker-Compose-Projekt `miniplan-e2e`), seedet Testdaten und räumt Container/Netzwerke danach –
auch bei fehlgeschlagenen Tests – automatisch wieder ab.
