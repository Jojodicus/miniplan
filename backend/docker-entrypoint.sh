#!/usr/bin/env sh
set -e

alembic upgrade head
# --proxy-headers/--forwarded-allow-ips sorgen dafür, dass uvicorn den X-Forwarded-For-Header
# eines davorstehenden Reverse Proxys (Caddy, Nginx Proxy Manager, ...) auswertet und
# request.client.host auf die echte Client-IP setzt - sonst sähe z.B. das Login-Rate-Limit
# (app/rate_limit.py) für alle Nutzer dieselbe Proxy-IP und würde nach wenigen Versuchen
# insgesamt alle blockieren. UVICORN_FORWARDED_ALLOW_IPS muss auf die IP/CIDR des Proxys
# gesetzt werden (siehe README.md), Default 127.0.0.1 entspricht uvicorns eigenem Default und
# ändert am direkten Betrieb ohne Proxy nichts.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    --proxy-headers --forwarded-allow-ips "${UVICORN_FORWARDED_ALLOW_IPS:-127.0.0.1}"
