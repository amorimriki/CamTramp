"""
Descoberta automática de câmaras RTSP na rede local (README secção "Auto
discovery de câmaras").

Usa o nmap para varrer a rede local à procura de máquinas com a porta RTSP
(554 por omissão) aberta. Não tenta autenticar nem confirmar que é
realmente uma câmara de vídeo — só confirma que há algo a aceitar ligações
TCP nessa porta; cabe ao utilizador validar o URL final (utilizador,
password e path do stream variam por marca/modelo de câmara).
"""

from __future__ import annotations

import ipaddress
import re
import shutil
import subprocess

from api.system import get_lan_ip

RTSP_PORT = 554
NMAP_BINARY = "nmap"
SCAN_TIMEOUT_SECONDS = 30


class NmapNotFoundError(RuntimeError):
    """nmap não está instalado / não está no PATH desta máquina."""


def _local_subnet_cidr() -> str:
    """Assume uma máscara /24 a partir do IP local desta máquina —
    suficiente para as redes domésticas/pequenos ginásios onde este
    sistema corre (ver get_lan_ip em api/system.py)."""
    ip = get_lan_ip()
    network = ipaddress.ip_network(f"{ip}/24", strict=False)
    return str(network)


def _run_nmap(subnet: str, port: int) -> str:
    if shutil.which(NMAP_BINARY) is None:
        raise NmapNotFoundError(
            "nmap não está instalado. Instala com 'brew install nmap' (macOS) "
            "ou 'sudo apt install nmap' (Linux/Raspberry Pi) e tenta novamente."
        )
    # -Pn:   não faz "ping" ICMP prévio — muitas câmaras e routers bloqueiam
    #        ICMP e seriam ignoradas antes de sequer testar a porta RTSP.
    # -p:    só testa a porta RTSP (varrer todas as portas seria muito mais
    #        lento e desnecessário para este caso de uso).
    # --open: só devolve hosts com a porta encontrada aberta.
    # -T4:   perfil mais agressivo/rápido, adequado a redes locais.
    result = subprocess.run(
        [NMAP_BINARY, "-Pn", "-p", str(port), "--open", "-T4", subnet],
        capture_output=True,
        text=True,
        timeout=SCAN_TIMEOUT_SECONDS,
    )
    return result.stdout


_HOST_LINE = re.compile(r"Nmap scan report for .*?(\d+\.\d+\.\d+\.\d+)")


def _parse_open_hosts(nmap_output: str, port: int) -> list[str]:
    """Extrai da saída "normal" do nmap os IPs com a porta pedida aberta."""
    ips: list[str] = []
    current_ip: str | None = None
    for line in nmap_output.splitlines():
        match = _HOST_LINE.search(line)
        if match:
            current_ip = match.group(1)
            continue
        if current_ip and "open" in line and str(port) in line:
            ips.append(current_ip)
            current_ip = None
    return ips


def discover(port: int = RTSP_PORT) -> list[dict]:
    """Varre a rede local e devolve os dispositivos com a porta RTSP aberta.

    Cada resultado tem a forma {"ip", "port", "suggested_url"} —
    suggested_url é só um ponto de partida (rtsp://<ip>:<porta>/); o
    utilizador ainda tem de ajustar o path/credenciais conforme a câmara
    (ver botão "Testar" no formulário de câmaras).
    """
    subnet = _local_subnet_cidr()
    output = _run_nmap(subnet, port)
    ips = _parse_open_hosts(output, port)
    return [{"ip": ip, "port": port, "suggested_url": f"rtsp://{ip}:{port}/"} for ip in ips]
