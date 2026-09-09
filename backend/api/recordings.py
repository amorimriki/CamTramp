"""
Endpoint das gravações automáticas e permanentes:

    GET /api/recordings              # todas as câmaras
    GET /api/recordings?camera_id=1  # só de uma câmara

Os ficheiros em si são servidos como ficheiros estáticos (ver main.py,
app.mount("/recordings", ...)) — o "url" de cada RecordingInfo aponta
diretamente para lá, pronto a usar num <a href> ou <video> no frontend.
"""

from typing import Optional

from fastapi import APIRouter

from models.recording import RecordingInfo
from services import recording_manager

router = APIRouter(prefix="/api/recordings", tags=["recordings"])


@router.get("", response_model=list[RecordingInfo])
def list_recordings(camera_id: Optional[int] = None) -> list[RecordingInfo]:
    return recording_manager.list_recordings(camera_id)
