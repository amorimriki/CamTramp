"""
Endpoints relacionados com o streaming ao vivo e o buffer (README secção 5.1):

    GET  /api/cameras/{id}/stream
    GET  /api/cameras/{id}/buffer

Também se adicionam aqui dois endpoints de controlo do stream
(arrancar/parar o FFmpeg) que o README não lista explicitamente mas
que são necessários para o frontend poder ligar/desligar cada câmara:

    POST /api/cameras/{id}/stream/start
    POST /api/cameras/{id}/stream/stop
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from services import buffer_manager, camera_manager, stream_manager

router = APIRouter(prefix="/api/cameras", tags=["stream"])


class StreamStatus(BaseModel):
    camera_id: int
    running: bool
    hls_url: Optional[str] = None


class BufferSummaryResponse(BaseModel):
    camera_id: int
    available: bool
    segment_count: int
    duration_seconds: float
    buffer_start: Optional[datetime] = None
    buffer_end: Optional[datetime] = None


def _require_camera(camera_id: int) -> None:
    if camera_manager.get_camera(camera_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Câmara não encontrada")


def _status(camera_id: int, running: bool) -> StreamStatus:
    return StreamStatus(
        camera_id=camera_id,
        running=running,
        hls_url=f"/streams/{camera_id}/stream.m3u8" if running else None,
    )


@router.get("/{camera_id}/stream", response_model=StreamStatus)
def stream_status(camera_id: int) -> StreamStatus:
    """Estado atual do stream e URL do playlist HLS (se estiver a correr)."""
    _require_camera(camera_id)
    return _status(camera_id, stream_manager.is_running(camera_id))


@router.post("/{camera_id}/stream/start", response_model=StreamStatus)
def start_stream(camera_id: int) -> StreamStatus:
    """Arranca o FFmpeg da câmara (RTSP -> HLS)."""
    _require_camera(camera_id)
    try:
        camera_manager.start_stream(camera_id)
    except stream_manager.FFmpegNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    return _status(camera_id, True)


@router.post("/{camera_id}/stream/stop", response_model=StreamStatus)
def stop_stream(camera_id: int) -> StreamStatus:
    """Para o FFmpeg da câmara."""
    _require_camera(camera_id)
    camera_manager.stop_stream(camera_id)
    return _status(camera_id, False)


@router.get("/{camera_id}/buffer", response_model=BufferSummaryResponse)
def buffer_summary(camera_id: int) -> BufferSummaryResponse:
    """Intervalo de tempo atualmente disponível no buffer, para a barra de "recuar"."""
    _require_camera(camera_id)
    summary = buffer_manager.get_summary(camera_id)
    return BufferSummaryResponse(**summary.__dict__)
