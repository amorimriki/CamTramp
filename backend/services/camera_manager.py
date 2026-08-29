"""
Camera Manager — orquestra as operações sobre câmaras.

Responsabilidades (ver README secção 6):
    - Adicionar câmaras
    - Remover câmaras
    - Iniciar streams
    - Parar streams
    - Verificar o estado das câmaras

A configuração (CRUD) é persistida em JSON via database.py. O estado
"em execução" de cada câmara não é guardado à parte — é sempre
perguntado ao stream_manager.py (que gere os processos FFmpeg), para
não haver duas fontes de verdade que possam ficar dessincronizadas.
"""

from __future__ import annotations

from typing import Optional

from database import database as db
from models.camera import Camera, CameraCreate, CameraUpdate
from services import stream_manager

STATUS_STOPPED = "stopped"
STATUS_RUNNING = "running"


def list_cameras() -> list[Camera]:
    return [Camera(**c) for c in db.get_cameras()]


def get_camera(camera_id: int) -> Optional[Camera]:
    data = db.get_camera(camera_id)
    return Camera(**data) if data else None


def add_camera(payload: CameraCreate) -> Camera:
    created = db.create_camera(payload.model_dump())
    return Camera(**created)


def update_camera(camera_id: int, payload: CameraUpdate) -> Optional[Camera]:
    updated = db.update_camera(camera_id, payload.model_dump(exclude_unset=True))
    return Camera(**updated) if updated else None


def remove_camera(camera_id: int) -> bool:
    stream_manager.stop(camera_id)
    return db.delete_camera(camera_id)


def get_status(camera_id: int) -> str:
    """Estado atual da câmara: 'stopped' ou 'running'."""
    return STATUS_RUNNING if stream_manager.is_running(camera_id) else STATUS_STOPPED


def start_stream(camera_id: int) -> None:
    """Arranca o stream RTSP/FFmpeg da câmara."""
    camera = db.get_camera(camera_id)
    if camera is None:
        raise ValueError(f"Câmara {camera_id} não existe")
    stream_manager.start(camera_id, camera["rtsp_url"], camera["buffer_seconds"])


def stop_stream(camera_id: int) -> None:
    """Para o stream RTSP/FFmpeg da câmara."""
    stream_manager.stop(camera_id)


def start_all_enabled() -> None:
    """Arranca automaticamente o stream de todas as câmaras ativas.

    Chamado no arranque do backend (ver main.py, lifespan) para que o
    sistema já fique em streaming direto assim que o servidor liga —
    sem ser preciso carregar em "Ligar" à mão para cada câmara depois
    de um reinício da Raspberry Pi.
    """
    for camera in list_cameras():
        if not camera.enabled:
            continue
        try:
            start_stream(camera.id)
        except Exception as e:  # uma câmara com problemas não deve impedir as outras
            print(f"[camera_manager] falha ao arrancar automaticamente a câmara {camera.id} ({camera.name}): {e}")
