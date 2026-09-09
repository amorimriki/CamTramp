#!/usr/bin/env bash
#
# Remove o arranque automático instalado por scripts/install-autostart.sh.
#
set -euo pipefail

green()  { printf "\033[32m%s\033[0m\n" "$1"; }

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now camtramp.service 2>/dev/null || true
  systemctl --user daemon-reload 2>/dev/null || true
fi

rm -f "$HOME/.config/systemd/user/camtramp.service"
rm -f "$HOME/.config/autostart/camtramp-browser.desktop"

green "Arranque automático do CamTramp removido."
