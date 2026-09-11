#!/usr/bin/env bash
#
# Remove o arranque automático instalado por scripts/install-autostart.sh,
# incluindo a desativação da suspensão/hibernação do sistema.
#
set -euo pipefail

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now camtramp.service 2>/dev/null || true
  systemctl --user daemon-reload 2>/dev/null || true
fi

rm -f "$HOME/.config/systemd/user/camtramp.service"
rm -f "$HOME/.config/autostart/camtramp-browser.desktop"

# Reverte o "systemctl mask" do install-autostart.sh, devolvendo à máquina
# a capacidade normal de suspender/hibernar (útil se este deixar de ser um
# dispositivo dedicado, ex.: um portátil que volta a ser usado normalmente).
if command -v systemctl >/dev/null 2>&1; then
  if sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target 2>/dev/null; then
    green "Suspensão/hibernação do sistema reativada."
  else
    yellow "Não foi possível reativar a suspensão/hibernação automaticamente (sem sudo disponível?)."
    yellow "Corre manualmente: sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target"
  fi
fi

green "Arranque automático do CamTramp removido."
