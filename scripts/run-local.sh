#!/usr/bin/env bash
# Startet einen frischen Miniplan-Container zum manuellen Ausprobieren und
# reisst ihn beim Beenden (Ctrl+C) wieder ab.
# Nutzt dieselbe docker-compose.e2e.yml wie die Playwright-Tests (Port 8100,
# tmpfs statt Volume, seedet automatisch Pfarrei "St. Beispiel" +
# admin@example.com / geheim123).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose -p miniplan-e2e -f docker-compose.e2e.yml)
base_url="http://localhost:8100"

cd "$repo_root"

cleanup() {
  echo
  echo "Räume auf ..."
  "${compose[@]}" down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

"${compose[@]}" down --volumes --remove-orphans
"${compose[@]}" up -d --build

echo "Warte auf $base_url ..."
ready=false
for _ in $(seq 1 120); do
  if curl -sf "$base_url/api/health" > /dev/null; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != true ]; then
  echo "Server war nach 120s nicht erreichbar." >&2
  "${compose[@]}" logs
  exit 1
fi

echo "Miniplan läuft: $base_url"
echo "Login: admin@example.com / geheim123"
echo "Zum Beenden Ctrl+C drücken."

"${compose[@]}" logs -f
