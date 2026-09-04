"""
Endpoint de descoberta automática de câmaras RTSP na rede local:

    GET /api/discovery/scan   — varre a rede local (nmap) à procura de
                                 dispositivos com a porta RTSP aberta.

Ver backend/services/discovery.py para a implementação do scan.
"""

import subprocess

from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services import discovery

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


class DiscoveredDevice(BaseModel):
    ip: str
    port: int
    suggested_url: str


class ScanResult(BaseModel):
    devices: list[DiscoveredDevice]


@router.get("/scan", response_model=ScanResult)
async def scan(port: int = discovery.RTSP_PORT) -> ScanResult:
    """Varre a rede local (pode demorar alguns segundos) à procura de
    dispositivos com a porta RTSP aberta. Corre numa threadpool porque o
    nmap é um processo bloqueante (ver run_in_threadpool)."""
    try:
        devices = await run_in_threadpool(discovery.discover, port)
    except discovery.NmapNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="A varredura da rede demorou demasiado tempo.",
        )
    return ScanResult(devices=devices)
