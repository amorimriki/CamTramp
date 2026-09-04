"""
Endpoints de sistema, não relacionados com uma câmara específica.

    GET /api/system/network   — IP local (LAN) desta máquina, para o
                                 frontend mostrar como código QR (ver
                                 README): permite abrir a app a partir
                                 de outro dispositivo na mesma rede.
"""

import socket

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/system", tags=["system"])


class NetworkInfo(BaseModel):
    ip: str


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
