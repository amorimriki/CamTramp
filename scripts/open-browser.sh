#!/usr/bin/env bash
#
# Espera que o frontend do CamTramp esteja a responder e depois abre-o no
# browser por omissão. Pensado para correr automaticamente no login (ver
# scripts/install-autostart.sh) depois do systemd arrancar o backend e o
# frontend em segundo plano — por isso a espera é necessária: sem ela o
# browser podia abrir a app antes dela estar pronta a responder.
#
set -uo pipefail

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
URL="http://localhost:${FRONTEND_PORT}"
MAX_WAIT_SECONDS=60

waited=0
while ! curl -fsS -o /dev/null "$URL" 2>/dev/null; do
  sleep 1
  waited=$((waited + 1))
  if [ "$waited" -ge "$MAX_WAIT_SECONDS" ]; then
    # Não espera para sempre: abre à mesma — se o backend continuar
    # indisponível, o próprio browser mostra o erro de ligação.
    break
  fi
done

if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$URL"
elif command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser "$URL"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium "$URL"
elif command -v firefox >/dev/null 2>&1; then
  exec firefox "$URL"
else
  echo "Nenhum browser conhecido encontrado (xdg-open/chromium/firefox) para abrir $URL" >&2
  exit 1
fi
