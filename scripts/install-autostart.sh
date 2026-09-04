#!/usr/bin/env bash
#
# Instala o arranque automático do CamTramp no login (Linux/Raspberry Pi OS
# com ambiente gráfico):
#   1. Um serviço systemd --user que arranca o backend+frontend (start.sh).
#   2. Uma entrada de autostart XDG que abre o browser no dashboard assim
#      que o backend/frontend estiverem prontos (scripts/open-browser.sh).
#
# Uso (a partir da pasta do projeto, como o próprio utilizador — sem sudo):
#   ./scripts/install-autostart.sh
#
# Para desinstalar: ./scripts/uninstall-autostart.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }

if [ "$(uname -s)" != "Linux" ]; then
  red "Este script destina-se a Linux (Raspberry Pi OS). Em macOS corre o CamTramp manualmente com ./start.sh."
  exit 1
fi

command -v systemctl >/dev/null 2>&1 || { red "systemctl não encontrado — este script precisa de systemd."; exit 1; }

SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$SYSTEMD_USER_DIR" "$AUTOSTART_DIR"

sed "s#__PROJECT_DIR__#${PROJECT_DIR}#g" "$SCRIPT_DIR/camtramp.service.template" > "$SYSTEMD_USER_DIR/camtramp.service"
chmod +x "$SCRIPT_DIR/open-browser.sh"
sed "s#__PROJECT_DIR__#${PROJECT_DIR}#g" "$SCRIPT_DIR/camtramp-browser.desktop.template" > "$AUTOSTART_DIR/camtramp-browser.desktop"

systemctl --user daemon-reload
systemctl --user enable --now camtramp.service

# Permite que o serviço --user arranque mesmo sem uma sessão de login
# interativa (ex.: Raspberry Pi com autologin em consola/kiosk) — sem isto
# o serviço só corre enquanto há uma sessão ativa.
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" 2>/dev/null || true
fi

echo
green "Arranque automático instalado:"
echo "  - Serviço systemd --user: camtramp.service (backend + frontend)"
echo "  - Autostart do browser:   ~/.config/autostart/camtramp-browser.desktop"
echo
yellow "Estado do serviço:  systemctl --user status camtramp.service"
yellow "Logs em direto:     journalctl --user -u camtramp.service -f"
yellow "O browser abre sozinho no próximo login gráfico (não neste terminal)."
