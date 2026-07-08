# Miniplan

Selbst gehostete App für die Ministranten-Dienstplanung einer Pfarrei ("Miniplan"). Erstellen,
automatisches Füllen und Veröffentlichen der monatlichen Dienstpläne, inkl. Typst-PDF-Rendering
und Token-basiertem Self-Service für Ministranten.

## Stack

- **Backend:** Python (FastAPI), SQLAlchemy + Alembic, SQLite
- **Frontend:** React + Vite (TypeScript), react-router-dom, `@dnd-kit/core` (Drag-and-Drop),
  Paketmanager pnpm
- **Auth:** Username/Passwort + JWT (im httpOnly-Cookie, alternativ per `Authorization: Bearer`-Header)
- **Deployment:** ein Docker-Container (Frontend-Build wird vom Backend als Static Files
  ausgeliefert), Typst-Binary im Image

## Verzeichnisstruktur

```
backend/
  app/
    api/          FastAPI-Router (auth, pfarreien, gruppen, minis, dienst_typen, miniplaene,
                  gottesdienste, ...)
    models/       SQLAlchemy-Modelle
    schemas/      Pydantic-Schemas für Request/Response
    config.py     Settings (aus Umgebungsvariablen mit Präfix MINIPLAN_); generiert und persistiert
                  den JWT-Secret-Key automatisch in MINIPLAN_SECRET_KEY_FILE, falls kein
                  MINIPLAN_SECRET_KEY gesetzt ist
    database.py   Engine/Session/Base, get_db-Dependency
    security.py   Passwort-Hashing (bcrypt), JWT-Erstellung/-Validierung
    deps.py       Auth-Dependencies (get_current_user, require_admin, RequirePfarreiRolle,
                  get_pfarrei)
    rate_limit.py In-Memory-Rate-Limit pro Client-IP für den Login-Endpoint (gilt nur pro
                  Prozess, siehe Deployment-Hinweis dort)
    services/     Business-Logik jenseits reiner CRUD-Operationen (Feiertags-/Ferien-Sync,
                  Verfügbarkeitsprüfung, Typst-PDF-Rendering, automatische Zuteilung)
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
    pages/        Seiten-Komponenten (Login, Dashboard, Stammdaten, Miniplaene, Miniplan-Editor, ...)
  e2e/            Playwright-Tests; global-setup.ts/global-teardown.ts bauen/starten bzw. stoppen
                  den echten Docker-Container (docker-compose.e2e.yml) automatisch
Dockerfile              Multi-Stage-Build: Frontend-Build -> Backend-Image (inkl. Typst-Binary),
                        HEALTHCHECK gegen /api/health
docker-compose.yml      Deployment: ein Service, SQLite + Secret-Key-Datei im Volume /data
docker-compose.e2e.yml  isolierte Variante für Playwright-E2E-Tests (eigener Port 8100, tmpfs
                        statt Volume, seedet Testdaten beim Start noch vor dem Öffnen des Ports)
```

## Datenmodell

- **Pfarrei**: Name
- **Nutzer**: E-Mail, Passwort-Hash, `ist_admin` (globale Admin-Rolle)
- **NutzerPfarreiRolle**: verknüpft Nutzer + Pfarrei mit einer pfarrei-bezogenen Rolle
  (`pfarrei_verantwortlicher`, `betrachter`); ein Nutzer kann in mehreren Pfarreien unterschiedliche
  Rollen haben. Admins sind global und benötigen keinen Eintrag hier.
- **Gruppe**: pro Pfarrei, Name (z.B. "neu", "normal", "Obermini")
- **Filtertag**: pro Pfarrei frei definierbarer Verfügbarkeits-Status für Minis (Key, Label,
  `ist_schueler_artig`-Flag für Ferien-/Feiertags-Regeln); Standardsatz beim Anlegen einer Pfarrei:
  `grundschueler`, `schueler`, `arbeiter` (siehe `services/stammdaten_seed.py`)
- **FiltertagBlocker**: pro Pfarrei + Filtertag ein wiederkehrendes Zeitfenster (Wochentag,
  Start-/Endzeit), in dem Minis mit diesem Status nicht verfügbar sind (z.B. Schulzeit); Ferien und
  Feiertage (`Ferienzeitraum`, `FeiertagEinstellung`) setzen diese Sperre für den jeweiligen Tag
  außer Kraft (siehe `services/verfuegbarkeit.py`)
- **Mini**: gehört zu einer Pfarrei + einer Gruppe, Name, Filtertags (JSON-Liste von
  `Filtertag.key`-Werten dieser Pfarrei)
- **DienstTyp**: pro Pfarrei, Name, Standard-Anzahl, Gruppen-Mindestanzahl-Anforderungen
- **Miniplan**: pro Pfarrei, Monat/Jahr (eindeutig je Pfarrei), Status (`in_bearbeitung` /
  `abgeschlossen`), Freitextfelder `veranstaltungen`/`ankuendigungen`; enthält eine Liste von
  `Gottesdienst`en
- **Gottesdienst**: gehört zu einem Miniplan, Datum, Uhrzeit, Name; enthält eine Liste von
  `Dienstbedarf`-Einträgen
- **Dienstbedarf**: gehört zu einem Gottesdienst, entweder von einem `DienstTyp` abgeleitet
  (`dienst_typ_id` gesetzt) oder ein freier Text-Dienst (`name` gesetzt) – bei Ableitung werden
  Anzahl und Gruppen-Anforderungen als eigene, unabhängig editierbare Kopie übernommen (keine
  Live-Verknüpfung zum `DienstTyp`); zusätzlich erforderliche Filtertags (JSON-Liste von
  `Filtertag.key`-Werten – ein zugewiesener Mini muss mindestens einen davon besitzen, leer =
  keine Einschränkung) und eine Liste von `Dienstbedarf.zuweisungen` (`DienstbedarfZuweisung`:
  Mini + `manuell_fixiert`-Flag – von Hand zugewiesen/fixiert bleibt beim automatischen Füllen
  unangetastet, sonst vom Zuteilungsalgorithmus vergeben; die API gibt beide Arten zusammen in
  `DienstbedarfOut.zuweisungen` aus, das Frontend trennt sie nach dem Flag)

Rollen-Autorisierung: `app/deps.py` stellt `require_admin` (nur globale Admins),
`RequirePfarreiRolle(*rollen)` (Admins oder Nutzer mit passender Rolle in der per Pfad-Parameter
`pfarrei_id` übergebenen Pfarrei) sowie `get_pfarrei` (lädt die Pfarrei zum Pfad-Parameter
`pfarrei_id` oder liefert 404) als FastAPI-Dependencies bereit. Die Stammdaten-Endpunkte
(`/api/pfarreien/{pfarrei_id}/gruppen`, `/minis`, `/dienst-typen`) sowie die meisten
Miniplan-Endpunkte (`/miniplaene`, `/miniplaene/{id}/gottesdienste`, `/miniplaene/{id}/status`)
erfordern `pfarrei_verantwortlicher` (oder globalen Admin) der jeweiligen Pfarrei; der PDF-Download
(`GET /miniplaene/{id}/pdf`) ist zusätzlich für `betrachter` freigegeben. `GET /api/pfarreien/mine`
liefert die Pfarreien des eingeloggten Nutzers (Admins: alle) für die Übersichtsseite.

Gottesdienste werden mit ihrem vollständigen Dienstbedarf als verschachtelte Liste angelegt/
aktualisiert (`PUT /gottesdienste/{id}` ersetzt die komplette Dienstbedarf-Liste, analog zum
bestehenden Muster für `DienstTyp.gruppen_anforderungen`); es gibt keine separaten
CRUD-Endpunkte für einzelne Dienstbedarf-Einträge.

## Typst-Rendering & Live-Vorschau

`app/services/typst_render.py` baut aus dem aktuellen (noch nicht zwingend gespeicherten)
Planstand ein Typst-Dokument als String und kompiliert es per `typst compile` (Subprocess) zu
PDF-Bytes. Sämtliche dynamischen Werte (Namen, Freitexte, ...) werden ausschließlich als
escapte Typst-String-Literale (`#"..."`) eingefügt statt als Markup verkettet – dadurch ist
eine Typst-Code-Injection über z.B. Mini- oder Gottesdienstnamen ausgeschlossen. Schlägt die
Kompilierung fehl, wirft der Service `TypstCompileError` mit einer strukturierten Liste der
`error:`-Zeilen aus der Typst-Fehlerausgabe.

`POST /api/pfarreien/{pfarrei_id}/miniplaene/{miniplan_id}/vorschau` (Rolle wie die übrigen
Miniplan-Endpunkte) nimmt den kompletten Planstand entgegen (Schema
`schemas/miniplan_vorschau.py`, bereits mit aufgelösten Namen statt IDs, da das Frontend diese
aus den bereits geladenen Stammdaten kennt) und liefert bei Erfolg die PDF-Bytes
(`application/pdf`), bei einem Compile-Fehler `422` mit `{"detail": {"fehler": [...]}}`.

Frontend: `MiniplanEditorPage` rendert eine `VorschauPanel`-Komponente, die bei jeder Änderung
des Editor-Zustands (ungespeicherte Drafts eingeschlossen) debounced (500ms) `miniplanVorschau`
aufruft und das resultierende PDF anzeigt; Compile-Fehler werden als Liste in einem `Alert`
dargestellt. Der Editor speichert Änderungen automatisch (debounced, 800ms); der aggregierte
Speicherstatus wird neben dem Seitentitel angezeigt.

Für den Status-Übergang `in_bearbeitung` → `abgeschlossen` (und zurück) gibt es
`POST /api/pfarreien/{pfarrei_id}/miniplaene/{miniplan_id}/status`. Das finale PDF wird über
`GET /api/pfarreien/{pfarrei_id}/miniplaene/{miniplan_id}/pdf` erzeugt – dieser Endpunkt liest
(anders als `/vorschau`) den gespeicherten Planstand aus der DB, wandelt ihn über
`schemas/miniplan_vorschau.miniplan_zu_vorschau` in dieselbe `MiniplanVorschauIn`-Struktur um und
rendert damit über `render_miniplan_pdf`; er liefert nur bei Status `abgeschlossen` ein PDF
(sonst `409`). `MiniplanEditorPage` zeigt dazu einen Abschließen-/Wieder-öffnen-Button sowie,
sobald abgeschlossen, einen Download-Button.

## Automatische Zuteilung ("Füllen")

`app/services/zuteilung.py` (`zuteilung_vorschlagen(db, pfarrei_id, miniplan)`) schlägt für jede
noch nicht besetzte Stelle eines Dienstbedarfs (aus dessen `anzahl` abgeleitet) einen Mini vor.
Manuell fixierte Zuweisungen (`manuell_fixiert=True`) werden nie verändert, fließen aber in
Fairness- und Belegungs-Berechnung ein. Harte Constraints werden nie verletzt – bleibt dafür kein
passender Mini übrig, bleibt die Stelle unbesetzt:

- Gruppen-Mindestanzahl eines Dienstbedarfs (die entsprechende Anzahl an Stellen wird vorab auf
  die jeweilige Gruppe festgelegt)
- erforderliche Filtertags des Dienstbedarfs (Mini muss mindestens einen davon besitzen)
- Verfügbarkeit laut `services/verfuegbarkeit.ist_blockiert` für jeden Filtertag des Minis zu
  Datum/Uhrzeit des Gottesdienstes
- kein Mini doppelt innerhalb desselben Gottesdienstes

Darüber hinaus optimiert eine simulierte Abkühlung (Swap- und Ersatz-Züge zwischen freien Stellen,
Badness-Funktion aus Varianz der Diensthäufigkeit + Strafe für zu dicht aufeinanderfolgende
Termine desselben Minis) die Zuteilung; der jeweils beste gefundene Zustand wird gemerkt und am
Ende wiederhergestellt (die Abkühlung selbst akzeptiert zwischenzeitlich auch verschlechternde
Züge). `POST /api/pfarreien/{pfarrei_id}/miniplaene/{miniplan_id}/fuellen` wendet den Vorschlag an:
alle nicht fixierten Zuweisungen werden ersetzt (erneutes Füllen ist also ein vollständiger
Neu-Lauf über alle freien Stellen, nicht nur über seit dem letzten Lauf leere).

Manuelle und automatische Zuweisungen lassen sich zusätzlich per Drag-and-Drop verändern (zwei
weitere Endpunkte, gleiche Rolle wie `fuellen`):

- `POST .../miniplaene/{id}/zuweisungen/tauschen` (Body `{zuweisung_id_a, zuweisung_id_b}`)
  tauscht die Minis zweier `DienstbedarfZuweisung`-Zeilen (auch über verschiedene Gottesdienste/
  Dienstbedarf hinweg) – das `manuell_fixiert`-Flag bleibt dabei an der Zeile/Stelle hängen, nicht
  am Mini. Aus Unique-Constraint-Gründen (`dienstbedarf_id`, `mini_id`) werden dafür beide Zeilen
  gelöscht und mit vertauschten Minis neu angelegt, nicht per In-Place-Update getauscht.
- `POST .../miniplaene/{id}/zuweisungen/{zuweisung_id}/fixierung` (Body `{manuell_fixiert}`) setzt
  das Flag einer einzelnen Zeile.

Aus demselben Grund löscht auch `fuellen` die zu ersetzenden Zeilen zuerst und flusht, bevor die
neuen eingefügt werden (ein erneuter Lauf kann denselben Mini wieder derselben Stelle zuteilen).

Frontend: Der "Füllen"-Button in `MiniplanEditorPage` löst den Endpoint aus und lädt den Miniplan
neu. Da jede `GottesdienstKarte` ihren Dienstbedarf nur beim ersten Rendern aus den Props in
eigenen State übernimmt, erzwingt ein Revisions-Zähler im `key`-Prop der Karten nach jeder dieser
drei Mutationen (Füllen, Tauschen, Fixieren) einen Remount, damit die neuen Zuweisungen sichtbar
werden (Helper `refreshNachMutation`).

Pro Dienstbedarf zeigt der Editor zwei Bereiche: "Fest zugewiesen" (durchsuchbare Checkbox-Chip-
Liste wie bisher, treibt `fixierte_mini_ids`) und "Automatisch zugewiesen" (nur sichtbar wenn
vorhanden, reine Anzeige aus dem Server-Stand, nicht Teil des editierbaren Drafts – sonst würde ein
Autosave für ein anderes Feld automatisch zugewiesene Minis fälschlich als fest zugewiesen
zurückschreiben). Ein einziger `DndContext` umschließt alle Gottesdienst-Karten; jeder Zuweisungs-
Chip ist gleichzeitig Drag-Quelle und Drop-Ziel (Drop auf einen anderen Chip = Tauschen), die
beiden Bereiche sind zusätzlich je Dienstbedarf eigene Drop-Ziele (Drop auf die Fläche statt auf
einen Chip = Fixierung setzen/aufheben für die gezogene Zeile). Damit ein frisch zu einer Karte
hinzugefügter Dienst-Typ/Freitext-Bedarf nach dem ersten Speichern eine echte `dienstbedarfId` für
diese Drag-Ziele bekommt (initial `null`), pflegt `GottesdienstKarte` dafür eine eigene, von
`bedarfListe` getrennte Map (`dienstbedarfIdMap`, analog `serverZuweisungenMap`) – eine Aktualisierung
direkt in `bedarfListe` würde sonst den Autosave-Effekt erneut auslösen.

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
- README.md ist nutzerfacing und bleibt knapp: nur das Nötigste (was tun, welche Variable
  setzen), keine Begründungen, keine Beispiel-Configs für Drittsoftware, keine Wiederholung
  von Offensichtlichem.
- CLAUDE.md bleibt ein Überblick (Struktur, Datenmodell, Befehle) und wächst nicht mit jeder
  Änderung mit. Nicht-offensichtliches Warum (Design-Entscheidungen, Bugs die eine Änderung
  motiviert haben) gehört als knapper Kommentar direkt an die betroffene Stelle im Code.
