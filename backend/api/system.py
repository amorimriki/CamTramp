"""
Endpoints de sistema, não relacionados com uma câmara específica.

    GET  /api/system/network   — IP local (LAN) desta máquina, para o
                                  frontend mostrar como código QR (ver
                                  README): permite abrir a app a partir
                                  de outro dispositivo na mesma rede.
    POST /api/system/restart   — reinicia o backend+frontend (só funciona
                                  quando instalado como serviço systemd
                                  --user via scripts/install-autostart.sh,
                                  ver README secção 10).
    POST /api/system/stop      — para o backend+frontend e fecha a
                                  aplicação (mesmo requisito do restart).
    POST /api/system/reset     — apaga todas as câmaras guardadas, os
                                  logs de FFmpeg, as gravações permanentes
                                  e o buffer de vídeo (tudo o que ficaria
                                  órfão/sem uso depois de as câmaras
                                  deixarem de existir).
    POST /api/system/install-autostart   — corre scripts/install-autostart.sh
                                  (README secção 10): serviço systemd --user,
                                  autostart do browser e desativa a suspensão
                                  do sistema.
    POST /api/system/uninstall-autostart — corre scripts/uninstall-autostart.sh:
                                  remove tudo o que o install-autostart
                                  instalou.
    POST /api/system/check-password      — só confirma a password, sem
                                  executar nenhuma ação (usado pela
                                  interface para abrir o card de
                                  administração — ver Settings.tsx).

Todas as ações acima pedem sempre a password definida em
ADMIN_ACTION_PASSWORD (backend/config/settings.py) — ver o aviso nesse
ficheiro sobre o que esta proteção é e não é.
"""

import re
import shutil
import socket
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from config.settings import (
    ADMIN_ACTION_PASSWORD,
    BUFFER_DIR,
    LOGS_DIR,
    RECORDINGS_DIR,
    SCRIPTS_DIR,
)
from database import database as db
from services import stream_manager

# Tempo máximo à espera de um script em scripts/ (install/uninstall-
# autostart.sh) — inclui chamadas a systemctl e, possivelmente, sudo; não
# deve normalmente demorar mais do que alguns segundos, mas mantém-se uma
# margem generosa para uma Raspberry Pi mais lenta.
SCRIPT_TIMEOUT_SECONDS = 60

# Os scripts em scripts/ usam cores ANSI no terminal (ver green()/yellow()/
# red() em install-autostart.sh e uninstall-autostart.sh) — fazem sentido
# numa consola, mas ficariam como carateres ilegíveis dentro de um <pre>
# na interface web, que não interpreta códigos de escape.
_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")


def _strip_ansi(text: str) -> str:
    return _ANSI_ESCAPE_RE.sub("", text)

router = APIRouter(prefix="/api/system", tags=["system"])

SYSTEMD_UNIT = "camtramp.service"


class NetworkInfo(BaseModel):
    ip: str


class RestartResult(BaseModel):
    ok: bool
    message: str
    # Output completo (stdout+stderr) de um script corrido a pedido — só
    # vem preenchido pelos endpoints install/uninstall-autostart; o
    # restart/stop/reset não o define (não haveria tempo de o capturar,
    # ver comentário em restart_app).
    output: Optional[str] = None


class AdminActionRequest(BaseModel):
    """Corpo pedido a qualquer ação de sistema protegida (restart, stop,
    reset, install/uninstall-autostart e check-password)."""

    password: str


def get_lan_ip() -> str:
    """Devolve o IP local (LAN) desta máquina.

    Não depende de internet: o "connect" de um socket UDP só define qual
    a interface de saída para esse destino (consulta à tabela de rotas
    do sistema operativo), não chega a enviar nenhum pacote — funciona
    mesmo sem ligação à internet, desde que exista uma rede local.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


@router.get("/network", response_model=NetworkInfo)
def network_info() -> NetworkInfo:
    return NetworkInfo(ip=get_lan_ip())


def _check_password(payload: AdminActionRequest) -> None:
    """Confirma a password de administração antes de qualquer ação de
    sistema protegida (restart, stop, reset, install/uninstall-autostart).
    Ver o aviso em ADMIN_ACTION_PASSWORD (config/settings.py) sobre o
    alcance real desta proteção."""
    if payload.password != ADMIN_ACTION_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password incorreta.",
        )


@router.post("/check-password", response_model=RestartResult)
def check_password(payload: AdminActionRequest) -> RestartResult:
    """Só confirma a password de administração, sem executar nenhuma ação.

    Usado pela interface (botão "Admin" em Settings.tsx) para só abrir o
    card com as ações protegidas depois de confirmar a password — em vez
    de a pessoa descobrir que a escreveu mal só ao clicar numa ação lá
    dentro."""
    _check_password(payload)
    return RestartResult(ok=True, message="Password correta.")


def _systemd_service_active() -> bool:
    """Confirma que o CamTramp está mesmo a correr como o serviço systemd
    --user instalado por scripts/install-autostart.sh — só nesse caso faz
    sentido (e é seguro) pedir a esse serviço para reiniciar/parar sozinho."""
    if shutil.which("systemctl") is None:
        return False
    result = subprocess.run(
        ["systemctl", "--user", "is-active", SYSTEMD_UNIT],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == "active"


def _clear_directory(directory: Path) -> None:
    """Apaga todo o conteúdo de `directory` (ficheiros e subpastas), sem
    apagar a própria pasta — usado pelo /reset para limpar gravações e
    buffer, que depois de um reset ficariam órfãos (referem câmaras que já
    não existem na base de dados) e sem qualquer uso."""
    if not directory.exists():
        return
    for entry in directory.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=True)
        else:
            entry.unlink(missing_ok=True)


def _require_systemd_service(action_description: str) -> None:
    if not _systemd_service_active():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "O CamTramp não está a correr como serviço systemd --user "
                f"('{SYSTEMD_UNIT}'). Esta opção só funciona depois de instalar "
                "o arranque automático (README secção 10, "
                "scripts/install-autostart.sh); em desenvolvimento, "
                f"{action_description}."
            ),
        )


@router.post("/restart", response_model=RestartResult)
def restart_app(payload: AdminActionRequest) -> RestartResult:
    """Reinicia o backend+frontend, via `systemctl --user restart
    camtramp.service`. É um serviço --user (não precisa de sudo).

    O "sleep 1" antes do restart dá tempo à resposta HTTP chegar ao
    frontend antes do próprio processo que a está a enviar ser terminado
    — o comando corre destacado (start_new_session), por isso sobrevive
    ao fim deste pedido. O restart em si é pedido ao gestor systemd (um
    processo à parte, sempre vivo), não a este processo — por isso é
    seguro este processo ser morto a meio sem o restart falhar."""
    _check_password(payload)
    _require_systemd_service("reinicia manualmente (Ctrl+C e ./start.sh outra vez)")
    subprocess.Popen(
        ["sh", "-c", f"sleep 1 && systemctl --user restart {SYSTEMD_UNIT}"],
        start_new_session=True,
    )
    return RestartResult(ok=True, message="A reiniciar a aplicação...")


@router.post("/stop", response_model=RestartResult)
def stop_app(payload: AdminActionRequest) -> RestartResult:
    """Para o backend+frontend (`systemctl --user stop camtramp.service`)
    e fecha a aplicação — ao contrário do /restart, não volta a arrancar
    sozinho depois. Mesmo mecanismo de "sleep 1 em segundo plano" do
    /restart, para a resposta HTTP conseguir chegar ao frontend antes do
    processo ser terminado."""
    _check_password(payload)
    _require_systemd_service("para manualmente (Ctrl+C nos processos do ./start.sh)")
    subprocess.Popen(
        ["sh", "-c", f"sleep 1 && systemctl --user stop {SYSTEMD_UNIT}"],
        start_new_session=True,
    )
    return RestartResult(ok=True, message="A encerrar a aplicação...")


@router.post("/reset", response_model=RestartResult)
def reset_app(payload: AdminActionRequest) -> RestartResult:
    """Repõe a base de dados (apaga todas as câmaras guardadas) e limpa
    tudo o que fica sem uso depois disso: os logs de FFmpeg, as gravações
    permanentes (`storage/recordings/`) e o buffer de vídeo
    (`storage/buffer/`) — sem câmaras configuradas, esses ficheiros só
    ocupam espaço em disco e já não são acessíveis por nenhum id de
    câmara válido.

    Ao contrário do restart/stop, não depende de o CamTramp estar
    instalado como serviço systemd: funciona também em desenvolvimento,
    porque não mexe em nenhum processo do sistema, só em ficheiros desta
    própria aplicação."""
    _check_password(payload)
    # para primeiro todos os streams: evita processos FFmpeg a escrever
    # ainda em ficheiros que estão prestes a ser apagados, e uma câmara
    # que já não existe na base de dados a seguir ao reset não devia
    # continuar a correr de qualquer forma
    stream_manager.stop_all()
    db.reset_db()
    for log_file in LOGS_DIR.glob("*.log"):
        log_file.unlink(missing_ok=True)
    _clear_directory(RECORDINGS_DIR)
    _clear_directory(BUFFER_DIR)
    return RestartResult(
        ok=True,
        message="Base de dados, gravações, buffer e logs repostos.",
    )


def _run_script(script_path: Path, action_description: str) -> RestartResult:
    """Corre um script de scripts/ e devolve o output completo (stdout+
    stderr) para dar feedback real na interface.

    Ao contrário do restart/stop (que têm de sobreviver ao próprio
    processo ser morto a meio — daí o truque do "sleep 1" em segundo
    plano), estes scripts não desligam este processo por si só, por isso
    corre-se de forma síncrona e à espera do resultado, sem perder o
    output para o utilizador ver o que aconteceu."""
    if not script_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script não encontrado: {script_path}",
        )
    try:
        result = subprocess.run(
            [str(script_path)],
            cwd=str(script_path.parent.parent),
            capture_output=True,
            text=True,
            timeout=SCRIPT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as e:
        output = _strip_ansi((e.stdout or "") + (e.stderr or ""))
        return RestartResult(
            ok=False,
            message=f"Tempo esgotado a {action_description} (mais de {SCRIPT_TIMEOUT_SECONDS}s).",
            output=output.strip() or None,
        )

    output = _strip_ansi((result.stdout or "") + (result.stderr or ""))
    ok = result.returncode == 0
    message = (
        f"Concluído: {action_description}."
        if ok
        else f"Falhou: {action_description} (código de saída {result.returncode})."
    )
    return RestartResult(ok=ok, message=message, output=output.strip() or None)


@router.post("/install-autostart", response_model=RestartResult)
def install_autostart(payload: AdminActionRequest) -> RestartResult:
    """Corre scripts/install-autostart.sh (README secção 10): instala o
    serviço systemd --user, o autostart do browser em modo kiosk, e
    desativa a suspensão/hibernação do sistema. Só funciona em Linux com
    systemd (o próprio script valida isso e explica-o no output).

    Não desliga este processo: "systemctl --user enable --now" num
    serviço já ativo não faz nada de mal (é idempotente); se a app ainda
    estiver a correr manualmente (./start.sh) em vez de como serviço,
    este passo cria e arranca o serviço a par do processo manual — os
    dois ficam a competir pelas mesmas portas, por isso recomenda-se
    fechar o processo manual (ou reiniciar a máquina) logo a seguir."""
    _check_password(payload)
    return _run_script(SCRIPTS_DIR / "install-autostart.sh", "instalar o arranque automático")


@router.post("/uninstall-autostart", response_model=RestartResult)
def uninstall_autostart(payload: AdminActionRequest) -> RestartResult:
    """Corre scripts/uninstall-autostart.sh: remove o serviço systemd, o
    autostart do browser, e reativa a suspensão/hibernação do sistema.

    Se a aplicação estiver neste momento a correr precisamente como esse
    serviço systemd, corrê-lo de forma síncrona desligaria este processo
    a meio da resposta (o mesmo problema do /stop) — por isso, só nesse
    caso, o script corre em segundo plano com o mesmo truque de "sleep 1"
    do /stop, e a interface não recebe o output completo (a aplicação
    fecha-se a seguir, como um /stop). A correr manualmente (./start.sh),
    corre-se já e devolve-se o output completo."""
    _check_password(payload)
    script_path = SCRIPTS_DIR / "uninstall-autostart.sh"
    if not script_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script não encontrado: {script_path}",
        )
    if _systemd_service_active():
        subprocess.Popen(
            ["sh", "-c", f"sleep 1 && '{script_path}'"],
            start_new_session=True,
            cwd=str(script_path.parent.parent),
        )
        return RestartResult(
            ok=True,
            message=(
                "A remover o arranque automático — a aplicação vai fechar-se "
                "de seguida, porque é o próprio serviço que a está a correr "
                "que vai ser desativado."
            ),
        )
    return _run_script(script_path, "remover o arranque automático")
