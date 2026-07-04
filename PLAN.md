# Miniplan – Ministranten-Dienstplan-App für die Pfarrei

## Context

Die Pfarrei erstellt aktuell die monatlichen Ministranten-Dienstpläne ("Miniplan") manuell. Ziel ist eine
selbst gehostete Docker-App, die das Erstellen, Ausfüllen (automatische, faire Zuteilung der
Ministranten) und Veröffentlichen dieser Pläne digitalisiert. Die Pläne werden über Typst gerendert
(PDF), es gibt Rollen für Admins, Pfarrei-Verantwortliche und Betrachter, sowie einen anonymen
Token-Zugang für Ministranten, damit diese selbst Verfügbarkeiten pflegen können.

Das Projekt ist zu groß für einen Durchlauf und wird **in den unten beschriebenen Schritten**
umgesetzt. Jeder Schritt ist für sich abnahmefähig (inkl. Tests) und baut auf dem vorherigen auf.
Diese Schritt-Einteilung ist ausschließlich eine Arbeitsplanung für die Umsetzung – sie taucht
**nicht** in Code, Commit-Inhalten oder der Projekt-Dokumentation auf (kein "Phase 3", "Teil B.2" o.ä.
in Code-Kommentaren, Docstrings oder CLAUDE.md). Code und Dokumentation beschreiben immer nur den
aktuellen Ist-Zustand, ohne Verweise auf frühere Zwischenstände ("vorher war X, jetzt Y").

## Code-Qualität & Arbeitsweise

- **KISS & DRY**, klare **Separation of Concerns** (Routing/HTTP-Layer, Business-Logik/Services,
  Datenzugriff/Models strikt getrennt; Frontend: UI-Komponenten von API-Client/State getrennt)
- Keine vorzeitige Abstraktion – Muster erst einführen, wenn sie tatsächlich gebraucht werden
- Jeder Schritt liefert lauffähigen, getesteten Code; kein halbfertiger Zwischenstand wird als
  "erledigt" markiert
- **`CLAUDE.md`** im Repo-Root wird bereits im ersten Schritt angelegt und danach bei **jeder**
  strukturellen Änderung (neue Module, geänderte Kommandos, neue Konventionen) sofort mit
  aktualisiert – sie beschreibt immer nur den aktuellen Stand (Architekturüberblick, Verzeichnisstruktur,
  Befehle zum Starten/Testen, Konventionen), keine Historie oder Phasennamen

## Teststrategie (gilt für jeden Schritt)

- **Backend:** Pytest – Unit-Tests für Services (insb. Zuteilungsalgorithmus, Typst-Rendering-Aufruf,
  Upload-Adapter) sowie Integrationstests für API-Endpunkte (inkl. Rollen-/Berechtigungsprüfung) gegen
  eine Test-SQLite-DB
- **Frontend (E2E/Workflow):** Playwright-Tests je neu hinzugekommenem Workflow (z.B. Login, Pfarrei/
  Minis anlegen, Miniplan-Editor, Füllen-Button, Mini-Token-Kalender, Abschluss+Upload), laufen gegen
  den per Docker gebauten bzw. lokal gestarteten Stack
- Tests werden **im selben Schritt** wie die zugehörige Funktionalität geschrieben, nicht nachträglich
  gesammelt; jeder Schritt gilt erst als abgeschlossen, wenn seine Tests grün sind

## Geklärte Eckdaten

- **Backend:** Python, FastAPI
- **Frontend:** React + Vite (TypeScript)
- **DB:** SQLite (via SQLAlchemy + Alembic-Migrationen)
- **Deployment:** ein einziger Docker-Container (Frontend wird gebaut und vom FastAPI-Backend als
  Static Files mitausgeliefert), Typst-Binary im Image installiert
- **Auth:** Username/Passwort + JWT, Rollen: `admin` (global), `pfarrei_verantwortlicher` (pro Pfarrei,
  many-to-many), `betrachter` (pro Pfarrei, nur Lesezugriff auf abgeschlossene Pläne + Download)
- **Account-Erstellung:** durch Admins im Frontend, oder per CLI-Skript im Backend-Container
  (`docker exec <container> python -m app.cli create-user --email ... --role ... --pfarrei ...`)
- **Ministranten (Minis):** kein echter Account – Zugriff nur über personalisierten Token-Link
- **Zuteilungs-Ziel-Website-Upload:** Ziel-CMS ist aktuell isiWeb (alt, wird evtl. auf OpenCMS
  umgestellt) → Upload wird als austauschbarer Adapter gebaut; aktuell liefert der Adapter immer
  `failed` zurück, dieser Zustand wird im Frontend sichtbar angezeigt. Der "Hochladen"-Button ist
  idempotent (setzt/prüft nur den Upload-Status in der DB).
- **Typst-Vorschau:** bei jeder relevanten Änderung schickt das Frontend (debounced) die Plandaten ans
  Backend, das Backend rendert per Typst ein PDF und gibt es zurück; Frontend zeigt es per
  PDF-Embed/iframe. Compile-Fehler von Typst werden strukturiert erfasst und im Frontend angezeigt.

## Datenmodell (Kern-Entitäten)

- **Pfarrei**: Name, Stammdaten
- **Nutzer**: Login-Daten; über `NutzerPfarreiRolle` (Join-Tabelle) mit Rolle pro Pfarrei verknüpft
  (ein Nutzer kann in mehreren Pfarreien unterschiedliche Rollen haben)
- **Gruppe**: pro Pfarrei (z.B. "neu", "normal", "Obermini")
- **Mini**: gehört zu einer Pfarrei + einer Gruppe; Basis-Filtertags (z.B. Grundschüler, Schüler,
  Arbeiter)
- **DienstTyp**: pro Pfarrei vordefiniert (z.B. Kreuz, Weihrauch, Leuchter, Buch), mit
  Standard-Anzahl und Standard-Gruppen-/Filter-Einschränkung (z.B. "Weihrauch: 2 Personen, mind. 1x
  Obermini")
- **Miniplan**: Pfarrei, Monat/Jahr, Status (`in_bearbeitung` / `abgeschlossen`), Freitextfelder
  (Veranstaltungen, Ankündigungen), Upload-Status (`nicht_hochgeladen` / `hochgeladen` /
  `fehlgeschlagen` + letzte Fehlermeldung)
- **Gottesdienst**: gehört zu einem Miniplan, Datum/Uhrzeit, Name/Typ; enthält Liste von
  **Dienstbedarf**-Einträgen: entweder ein `DienstTyp` (mit ggf. aufgehobener oder angepasster
  Gruppen-/Filter-Einschränkung, ggf. bereits manuell fest zugewiesenen Minis) oder ein freier
  Text-Dienst (frei benannt, z.B. "Alle Ministranten")
- **MiniPlanVerfügbarkeit**: pro Mini + Miniplan Sonderfilter/Sperrzeiträume (z.B. Urlaub), zusätzlich
  zu den Basis-Filtertags des Minis
- **MiniBlockierung**: einzelne durch den Mini selbst (per Token) im Kalender blockierte Termine
  innerhalb eines Planzeitraums
- **MiniToken**: personalisierter Zugangslink pro Mini, über den der Mini seinen Kalender blockt und
  seine eigenen Filtertags anpassen kann

## Zuteilungsalgorithmus ("Füllen"-Button)

Echte Optimalität ist NP-schwer; daher heuristischer Ansatz:
- **Badness-Funktion** bewertet eine komplette Zuteilung über: Varianz der Diensthäufigkeit pro Mini
  (Fairness), Bestrafung für zu dicht aufeinanderfolgende Dienste desselben Minis, Verletzung von
  Gruppen-/Filter-Einschränkungen (hart, sofern nicht aufgehoben), blockierte/nicht verfügbare Termine
  (hart), weiche Präferenzen als zusätzliche Gewichtung
- **Optimierung:** kein reiner Gradient Descent (diskretes Zuweisungsproblem), stattdessen
  **lokale Suche / Simulated Annealing** auf Swap-Basis (zwei Zuweisungen tauschen, wenn das die
  Badness verbessert bzw. mit Abkühlungs-Wahrscheinlichkeit auch bei Verschlechterung, um lokale
  Minima zu vermeiden) – deutlich robuster als Gradient Descent für diese Art Problem, gleicher
  Heuristik-Charakter wie ursprünglich vorgeschlagen
- Manuell fest zugewiesene Minis werden vor dem Lauf fixiert und vom Algorithmus nicht verändert

## Umsetzungsschritte

### Schritt: Projekt-Grundgerüst
- Repo-Struktur (`backend/`, `frontend/`), `Dockerfile` (Multi-Stage: Frontend-Build → in
  FastAPI-Static-Verzeichnis kopieren; Typst-Binary installieren), `docker-compose.yml` mit
  SQLite-Volume
- Backend: FastAPI-Skelett, SQLAlchemy-Models für Pfarrei/Nutzer/NutzerPfarreiRolle, Alembic-Setup
- Auth: Login-Endpoint, JWT-Erstellung/-Validierung, Rollen-Dependency für Endpunkte
- CLI-Skript `app/cli.py` für User-Erstellung (nutzt dieselbe DB-Logik wie die API)
- Frontend: Vite+React+TS-Skelett, Login-Seite, Grundlayout mit Routing
- `CLAUDE.md` initial anlegen (Stack, Verzeichnisstruktur, Start-/Testbefehle)
- Tests: Pytest für Login/JWT/Rollen-Dependency und CLI-User-Erstellung; Playwright-Test für den
  Login-Workflow

### Schritt: Stammdaten-Verwaltung
- CRUD für Gruppen, Minis (inkl. Basis-Filtertags), DienstTypen (inkl. Standard-Gruppen-/
  Filter-Einschränkung) – jeweils pro Pfarrei, nur für `admin`/`pfarrei_verantwortlicher` der
  jeweiligen Pfarrei
- Übersichtsseite: eingeloggter Nutzer sieht seine Pfarrei(en) und deren aktuelle Miniplan-Liste
- Tests: Pytest für CRUD-Endpunkte inkl. Berechtigungsgrenzen (fremde Pfarrei darf nicht bearbeitet
  werden); Playwright-Test für Anlegen/Bearbeiten einer Gruppe, eines Minis und eines DienstTyps

### Schritt: Miniplan- und Gottesdienst-Editor
- Miniplan anlegen (Monat/Jahr, Pfarrei), Status `in_bearbeitung`
- Gottesdienste innerhalb eines Plans anlegen/bearbeiten (Datum/Uhrzeit, Name)
- Pro Gottesdienst: Dienstbedarf zusammenstellen aus DienstTypen (Anzahl übernehmen/anpassen,
  Gruppen-/Filter-Einschränkung aufheben oder ändern, einzelne Minis manuell fest eintragen) sowie
  freie Text-Dienste hinzufügen
- Freitextfelder für Veranstaltungen/Ankündigungen unterhalb des Plans
- Tests: Pytest für Plan-/Gottesdienst-/Dienstbedarf-Endpunkte; Playwright-Test für den kompletten
  Editor-Workflow (Plan anlegen → Gottesdienst hinzufügen → Dienstbedarf konfigurieren → Freitext
  ausfüllen)

### Schritt: Typst-Rendering & Live-Vorschau
- Typst-Template für den Miniplan (Layout: Gottesdienste, Zuteilungen, Freitext-Bereiche)
- Backend-Endpoint: nimmt aktuellen Planstand, füllt Template, kompiliert per Typst-CLI zu PDF,
  gibt PDF + ggf. strukturierte Compile-Fehler zurück
- Frontend: debounced Anfrage bei Änderungen, PDF-Embed-Vorschau, Fehleranzeige bei
  Compile-Fehlern
- Tests: Pytest für den Render-Service (gültiger Plan → PDF-Bytes; fehlerhafter Plan → strukturierte
  Fehlermeldung); Playwright-Test, der eine Änderung im Editor vornimmt und prüft, dass die
  PDF-Vorschau aktualisiert wird

### Schritt: Automatische Zuteilung ("Füllen")
- Implementierung der Badness-Funktion und Simulated-Annealing-Zuteilung wie oben beschrieben
- Berücksichtigung von: Gruppen-/Filter-Einschränkungen pro Dienstbedarf, Basis-Filtertags der
  Minis, `MiniPlanVerfügbarkeit` (z.B. Urlaub), `MiniBlockierung` (Mini-Kalendersperren), bereits
  manuell fixierte Zuweisungen
- "Füllen"-Button im Frontend, Ergebnis wird direkt in der Vorschau sichtbar; Nutzer kann danach noch
  manuell nachjustieren und erneut füllen
- Tests: Pytest für die Badness-Funktion (harte Constraints werden nie verletzt) und für
  Fairness-/Abstands-Eigenschaften auf synthetischen Testdaten; Playwright-Test für den
  Füllen-Button-Workflow inkl. sichtbarer aktualisierter Vorschau

### Schritt: Mini-Self-Service (Token-Zugang)
- Verwaltung von `MiniToken` durch Pfarrei-Verantwortliche (erzeugen/widerrufen, Link kopieren)
- Öffentliche (token-authentifizierte, kein Login) Seite für Minis: Kalenderansicht zum Blocken
  eigener Termine, Anzeige und Bearbeitung der eigenen Basis-Filtertags
- Tests: Pytest für Token-Erzeugung/-Widerruf und die token-authentifizierten Endpunkte; Playwright-
  Test für den kompletten Mini-Workflow über den Token-Link (Kalender blocken, Filtertag ändern)

### Schritt: Plan-Lebenszyklus, Download & Website-Upload
- Statusübergang `in_bearbeitung` → `abgeschlossen` (manuell durch Pfarrei-Verantwortlichen nach
  Prüfung des gefüllten Plans)
- Download des PDFs für Nutzer mit Zugriff auf die Pfarrei (inkl. `betrachter`), aber nur wenn
  `abgeschlossen`
- "Hochladen"-Button: ruft austauschbaren `UploadProvider`-Adapter auf (aktuell Stub, liefert immer
  `failed`), Ergebnis idempotent in `Miniplan.upload_status` gespeichert und im Frontend inkl.
  Fehlermeldung angezeigt
- Tests: Pytest für Statusübergang, Download-Zugriffsbeschränkung und Upload-Idempotenz; Playwright-
  Test für Abschließen → Download → Hochladen-Button inkl. sichtbarer Fehleranzeige

## Betroffene Bereiche (repräsentativ, Struktur entsteht im ersten Schritt)

- `backend/app/models/` – SQLAlchemy-Modelle je Entität
- `backend/app/api/` – FastAPI-Router (auth, pfarreien, minis, dienste, miniplaene, tokens, upload)
- `backend/app/services/assignment.py` – Badness-Funktion + Simulated-Annealing-Zuteilung
- `backend/app/services/typst_render.py` – Typst-Template-Befüllung + Kompilierung
- `backend/app/services/upload.py` – `UploadProvider`-Interface + Stub-Implementierung
- `backend/app/cli.py` – Kommandozeilen-Nutzererstellung
- `backend/tests/` – Pytest-Suite
- `frontend/src/pages/` – Login, Pfarrei-Übersicht, Miniplan-Editor, Mini-Token-Seite
- `frontend/e2e/` – Playwright-Suite
- `Dockerfile`, `docker-compose.yml`, `CLAUDE.md`

## Verifikation je Schritt

- Backend: `pytest` im Backend-Container/venv – Modelle, Endpunkte, Rollen-Berechtigungen und (ab dem
  entsprechenden Schritt) der Zuteilungsalgorithmus
- Frontend-Workflows: Playwright-Testlauf für die im jeweiligen Schritt hinzugekommenen Workflows
- End-to-End: `docker compose up --build`, kompletten Ablauf (Login → Pfarrei/Minis anlegen →
  Miniplan erstellen → füllen → Vorschau → abschließen → Download/Upload) im Browser durchspielen
- Ein Schritt gilt erst als abgeschlossen, wenn Pytest- und Playwright-Suite vollständig grün sind und
  `CLAUDE.md` den aktuellen Stand widerspiegelt
