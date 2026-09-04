#!/usr/bin/env bash
#
# Arranca o backend (FastAPI/Uvicorn) e o frontend (Vite) do CamTramp
# em conjunto, e para os dois de forma limpa com Ctrl+C.
#
# Uso:
#   ./start.sh
#
# Variáveis opcionais:
#   BACKEND_PORT=8000 FRONTEND_PORT=5173 ./start.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_DIR="$SCRIPT_DIR/.run"
mkdir -p "$LOG_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }

# --- verificações prévias -------------------------------------------------
command -v python3 >/dev/null 2>&1 || { red "python3 não encontrado no PATH."; exit 1; }
command -v node    >/dev/null 2>&1 || { red "node não encontrado no PATH."; exit 1; }
command -v npm     >/dev/null 2>&1 || { red "npm não encontrado no PATH."; exit 1; }

if ! command -v ffmpeg >/dev/null 2>&1; then
  yellow "Aviso: ffmpeg não encontrado no PATH — o streaming das câmaras não vai funcionar."
  yellow "Instala com: brew install ffmpeg"
fi

if ! command -v nmap >/dev/null 2>&1; then
  yellow "Aviso: nmap não encontrado no PATH — a descoberta automática de câmaras (\"Procurar câmaras na rede\") não vai funcionar."
  yellow "Instala com: brew install nmap (macOS) ou sudo apt install nmap (Linux/Raspberry Pi)"
fi

# --- dependências do backend -----------------------------------------------
if ! python3 -c "import fastapi" >/dev/null 2>&1; then
  yellow "Dependências do backend em falta — a instalar (pip install -r requirements.txt)..."
  python3 -m pip install -r "$BACKEND_DIR/requirements.txt"
fi

# --- dependências do frontend -----------------------------------------------
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  yellow "Dependências do frontend em falta — a instalar (npm install)..."
  (cd "$FRONTEND_DIR" && npm install)
fi

# --- arranque ----------------------------------------------------------
PIDS=()

CLEANED_UP=0
cleanup() {
  if [ "$CLEANED_UP" -eq 1 ]; then
    return
  fi
  CLEANED_UP=1
  echo
  yellow "A parar os servidores..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  green "Servidores parados."
}
trap cleanup EXIT INT TERM

# Por omissão SEM --reload: o streaming das câmaras corre em processos ffmpeg
# filhos do backend, e um reload (reinício automático por alteração de ficheiro)
# mata e reinicia esses processos, cortando o buffer/stream ao vivo.
# Para desenvolvimento do backend com autoreload: DEV_RELOAD=1 ./start.sh
UVICORN_ARGS=(main:app --host 0.0.0.0 --port "$BACKEND_PORT")
if [ "${DEV_RELOAD:-0}" = "1" ]; then
  yellow "DEV_RELOAD=1: backend a correr com --reload (streams reiniciam a cada alteração de ficheiro)."
  UVICORN_ARGS+=(--reload)
fi

green "A arrancar o backend em http://localhost:${BACKEND_PORT} ..."
(
  cd "$BACKEND_DIR"
  exec python3 -m uvicorn "${UVICORN_ARGS[@]}"
) > "$LOG_DIR/backend.log" 2>&1 &
PIDS+=($!)

green "A arrancar o frontend em http://localhost:${FRONTEND_PORT} ..."
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
) > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)

sleep 1
echo
green "CamTramp a correr:"
green "  Frontend: http://localhost:${FRONTEND_PORT}  (acessível na rede local por http://<IP-desta-máquina>:${FRONTEND_PORT})"
green "  Backend:  http://localhost:${BACKEND_PORT}/docs"
echo
yellow "Logs em tempo real: tail -f ${LOG_DIR}/backend.log ${LOG_DIR}/frontend.log"
yellow "Ctrl+C para parar tudo."
echo

wait
