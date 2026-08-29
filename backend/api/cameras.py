"""
Endpoints REST para gestão de câmaras (ver README secção 5.1):

    GET    /api/cameras
    GET    /api/cameras/{id}
    POST   /api/cameras
    PUT    /api/cameras/{id}
    DELETE /api/cameras/{id}

(GET /api/cameras/{id} não estava explicitamente no README mas é
necessário para o ecrã de configuração de uma câmara individual.)
"""

from fastapi import APIRouter, HTTPException, status

from pydantic import BaseModel

from models.camera import Camera, CameraCreate, CameraUpdate
from services import camera_manager, stream_manager

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


class TestConnectionRequest(BaseModel):
    rtsp_url: str


class TestConnectionResponse(BaseModel):
    ok: bool
    message: str


@router.post("/test", response_model=TestConnectionResponse)
def test_connection(payload: TestConnectionRequest) -> TestConnectionResponse:
    """Testa a ligação RTSP sem criar/arrancar uma câmara (botão "TESTAR" do README secção 8)."""
    try:
        ok, message = stream_manager.test_connection(payload.rtsp_url)
    except stream_manager.FFmpegNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    return TestConnectionResponse(ok=ok, message=message)


@router.get("", response_model=list[Camera])
def list_cameras() -> list[Camera]:
    """Lista todas as câmaras configuradas."""
    return camera_manager.list_cameras()


@router.get("/{camera_id}", response_model=Camera)
def get_camera(camera_id: int) -> Camera:
    """Devolve uma câmara pelo id."""
    camera = camera_manager.get_camera(camera_id)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Câmara não encontrada")
    return camera


@router.post("", response_model=Camera, status_code=status.HTTP_201_CREATED)
def create_camera(payload: CameraCreate) -> Camera:
    """Adiciona uma nova câmara."""
    return camera_manager.add_camera(payload)


@router.put("/{camera_id}", response_model=Camera)
def update_camera(camera_id: int, payload: CameraUpdate) -> Camera:
    """Atualiza uma câmara existente (update parcial)."""
    camera = camera_manager.update_camera(camera_id, payload)
    if camera is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Câmara não encontrada")
    return camera


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(camera_id: int) -> None:
    """Remove uma câmara."""
    removed = camera_manager.remove_camera(camera_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Câmara não encontrada")
