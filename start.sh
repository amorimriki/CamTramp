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
#   DEV_RELOAD=1 ./start.sh
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Diretórios
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_DIR="$SCRIPT_DIR/.run"

mkdir -p "$LOG_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# ---------------------------------------------------------------------------
# Cores
# ---------------------------------------------------------------------------

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }

# ---------------------------------------------------------------------------
# Verificações
# ---------------------------------------------------------------------------

command -v python3 >/dev/null 2>&1 || {
    red "python3 não encontrado no PATH."
    red "Instala com: sudo apt update && sudo apt install -y python3"
    exit 1
}

command -v node >/dev/null 2>&1 || {
    red "node não encontrado no PATH."
    red "Instala o Node.js antes de executar este script."
    exit 1
}

command -v npm >/dev/null 2>&1 || {
    red "npm não encontrado no PATH."
    red "Instala o npm antes de executar este script."
    exit 1
}

if [ ! -d "$BACKEND_DIR" ]; then
    red "Diretório do backend não encontrado: $BACKEND_DIR"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    red "Diretório do frontend não encontrado: $FRONTEND_DIR"
    exit 1
fi

if [ ! -f "$BACKEND_DIR/requirements.txt" ]; then
    red "requirements.txt não encontrado em: $BACKEND_DIR"
    exit 1
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
    red "package.json não encontrado em: $FRONTEND_DIR"
    exit 1
fi

# ---------------------------------------------------------------------------
# FFmpeg
# ---------------------------------------------------------------------------

if ! command -v ffmpeg >/dev/null 2>&1; then
    yellow "Aviso: ffmpeg não encontrado no PATH."
    yellow "O streaming das câmaras não vai funcionar."
    yellow "Instala com:"
    yellow "  sudo apt update && sudo apt install -y ffmpeg"
fi

# ---------------------------------------------------------------------------
# nmap
# ---------------------------------------------------------------------------

if ! command -v nmap >/dev/null 2>&1; then
    yellow "Aviso: nmap não encontrado no PATH."
    yellow "A descoberta automática de câmaras (\"Procurar câmaras na rede\") não vai funcionar."
    yellow "Instala com:"
    yellow "  sudo apt update && sudo apt install -y nmap"
fi

# ---------------------------------------------------------------------------
# Python / Backend
# ---------------------------------------------------------------------------

VENV_DIR="$BACKEND_DIR/.venv"
PYTHON_BIN="$VENV_DIR/bin/python"

# Criar ambiente virtual automaticamente
if [ ! -x "$PYTHON_BIN" ]; then
    yellow "Ambiente virtual Python não encontrado."
    yellow "A criar: $VENV_DIR"

    python3 -m venv "$VENV_DIR"
fi

green "A usar ambiente virtual Python: $VENV_DIR"

# Atualizar pip dentro do ambiente virtual
"$PYTHON_BIN" -m pip install --upgrade pip >/dev/null 2>&1

# Instalar dependências se necessário
if ! "$PYTHON_BIN" -c "import fastapi" >/dev/null 2>&1; then
    yellow "Dependências do backend em falta — a instalar..."

    "$PYTHON_BIN" -m pip install -r "$BACKEND_DIR/requirements.txt"
fi


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    yellow "Dependências do frontend em falta — a instalar..."
    (
        cd "$FRONTEND_DIR"
        npm install
    )
fi

# ---------------------------------------------------------------------------
# Limpeza / encerramento
# ---------------------------------------------------------------------------

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
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Dá algum tempo para os processos terminarem corretamente
    sleep 1

    # Se algum ainda estiver vivo, força o encerramento
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done

    wait 2>/dev/null || true

    green "Servidores parados."
}

trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Uvicorn
# ---------------------------------------------------------------------------

UVICORN_ARGS=(
    main:app
    --host 0.0.0.0
    --port "$BACKEND_PORT"
)

if [ "${DEV_RELOAD:-0}" = "1" ]; then
    yellow "DEV_RELOAD=1: backend com --reload."
    yellow "Os streams podem reiniciar quando houver alterações nos ficheiros."
    UVICORN_ARGS+=(--reload)
fi

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------

green "A arrancar o backend em http://localhost:${BACKEND_PORT} ..."

(
    cd "$BACKEND_DIR"
    exec "$PYTHON_BIN" -m uvicorn "${UVICORN_ARGS[@]}"
) > "$LOG_DIR/backend.log" 2>&1 &

PIDS+=($!)

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

green "A arrancar o frontend em http://localhost:${FRONTEND_PORT} ..."

(
    cd "$FRONTEND_DIR"
    exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
) > "$LOG_DIR/frontend.log" 2>&1 &

PIDS+=($!)

# ---------------------------------------------------------------------------
# Informação
# ---------------------------------------------------------------------------

sleep 1

echo
green "CamTramp a correr:"
green "  Frontend: http://localhost:${FRONTEND_PORT}"
green "  Backend:  http://localhost:${BACKEND_PORT}/docs"
echo
yellow "A partir de outra máquina na rede:"
yellow "  Frontend: http://<IP-DESTA-MAQUINA>:${FRONTEND_PORT}"
yellow "  Backend:  http://<IP-DESTA-MAQUINA>:${BACKEND_PORT}/docs"
echo
yellow "Logs:"
yellow "  tail -f ${LOG_DIR}/backend.log"
yellow "  tail -f ${LOG_DIR}/frontend.log"
echo
yellow "Ctrl+C para parar tudo."
echo

wait
