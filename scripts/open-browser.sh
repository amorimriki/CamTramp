#!/usr/bin/env bash
#
# Espera que o frontend do CamTramp esteja a responder e depois abre-o no
# browser, em ecrã inteiro (modo kiosk) sempre que o browser encontrado
# suportar isso. Pensado para correr automaticamente no login (ver
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

# Este é o ecrã dedicado do ginásio (README secção 14) — por isso
# preferimos sempre um browser em modo "kiosk" (ecrã inteiro, sem barra de
# endereço nem abas) a um browser normal em janela. "--kiosk" (Chromium) e
# "-kiosk" (Firefox) dão ecrã inteiro verdadeiro; --noerrdialogs e
# --disable-infobars evitam que um crash anterior mostre um popup de
# "restaurar sessão" por cima do dashboard. Só se não houver nenhum destes
# browsers instalados é que se recorre ao xdg-open (browser por omissão do
# sistema, em janela normal — sem garantia de ecrã inteiro).
if command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser --kiosk --noerrdialogs --disable-infobars "$URL"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium --kiosk --noerrdialogs --disable-infobars "$URL"
elif command -v google-chrome >/dev/null 2>&1; then
  exec google-chrome --kiosk --noerrdialogs --disable-infobars "$URL"
elif command -v firefox >/dev/null 2>&1; then
  exec firefox -kiosk "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$URL"
else
  echo "Nenhum browser conhecido encontrado (chromium/firefox/xdg-open) para abrir $URL" >&2
  exit 1
fi
