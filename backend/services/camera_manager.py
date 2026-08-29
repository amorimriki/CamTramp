"""
Camera Manager — orquestra as operações sobre câmaras.

Responsabilidades (ver README secção 6):
    - Adicionar câmaras
    - Remover câmaras
    - Iniciar streams
    - Parar streams
    - Verificar o estado das câmaras

Nesta fase (primeira implementação, README secção 17) só a
configuração das câmaras está implementada — CRUD persistido em JSON
via database.py. O arranque/paragem reais dos streams RTSP dependem
de services/stream_manager.py (FFmpeg), que ainda não existe: as
funções start_stream/stop_stream ficam como stubs que só atualizam o
estado em memória, prontas a ser ligadas a esse módulo no próximo
passo.
"""

from __future__ import annotations

from typing import Optional

from database import database as db
from models.camera import Camera, CameraCreate, CameraUpdate

STATUS_STOPPED = "stopped"
STATUS_RUNNING = "running"

# Estado em memória do "runtime" de cada câmara (id -> estado).
# É reposto sempre que o backend reinicia; não é persistido em disco.
_camera_status: dict[int, str] = {}


def list_cameras() -> list[Camera]:
    return [Camera(**c) for c in db.get_cameras()]


def get_camera(camera_id: int) -> Optional[Camera]:
    data = db.get_camera(camera_id)
    return Camera(**data) if data else None


def add_camera(payload: CameraCreate) -> Camera:
    created = db.create_camera(payload.model_dump())
    _camera_status[created["id"]] = STATUS_STOPPED
    return Camera(**created)


def update_camera(camera_id: int, payload: CameraUpdate) -> Optional[Camera]:
    updated = db.update_camera(camera_id, payload.model_dump(exclude_unset=True))
    return Camera(**updated) if updated else None


def remove_camera(camera_id: int) -> bool:
    stop_stream(camera_id)
    removed = db.delete_camera(camera_id)
    _camera_status.pop(camera_id, None)
    return removed


def get_status(camera_id: int) -> str:
    """Estado atual da câmara: 'stopped' ou 'running'."""
    return _camera_status.get(camera_id, STATUS_STOPPED)


def start_stream(camera_id: int) -> None:
    """Inicia o stream RTSP/FFmpeg da câmara.

    TODO: ligar a services/stream_manager.py quando este for implementado.
    """
    if db.get_camera(camera_id) is None:
        raise ValueError(f"Câmara {camera_id} não existe")
    _camera_status[camera_id] = STATUS_RUNNING


def stop_stream(camera_id: int) -> None:
    """Para o stream RTSP/FFmpeg da câmara.

    TODO: ligar a services/stream_manager.py quando este for implementado.
    """
    _camera_status[camera_id] = STATUS_STOPPED
