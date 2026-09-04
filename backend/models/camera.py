"""
Modelos Pydantic relacionados com a Câmara.

Espelham a estrutura descrita no README:

    id
    name
    rtsp_url
    enabled
    created_at

`buffer_seconds` não é um campo configurável pelo cliente: é sempre o
valor fixo BUFFER_SECONDS (ver config/settings.py), devolvido nas
respostas da API só para o frontend o poder mostrar.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from config.settings import BUFFER_SECONDS


class CameraBase(BaseModel):
    """Campos partilhados entre criação e leitura."""

    name: str = Field(..., min_length=1, max_length=80, description="Nome identificativo da câmara")
    rtsp_url: str = Field(..., description="URL RTSP da câmara, ex.: rtsp://192.168.1.230:554/0")
    enabled: bool = Field(default=True, description="Se a câmara está ativa")

    @field_validator("rtsp_url")
    @classmethod
    def validate_rtsp_url(cls, value: str) -> str:
        if not value.startswith("rtsp://"):
            raise ValueError("rtsp_url deve começar por 'rtsp://'")
        return value


class CameraCreate(CameraBase):
    """Payload para criar uma nova câmara (POST /api/cameras)."""
    pass


class CameraUpdate(BaseModel):
    """Payload para atualizar uma câmara existente (PUT /api/cameras/{id}).

    Todos os campos são opcionais, para permitir updates parciais.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    rtsp_url: Optional[str] = None
    enabled: Optional[bool] = None


class Camera(CameraBase):
    """Câmara tal como é devolvida pela API."""

    id: int
    created_at: datetime
    buffer_seconds: int = BUFFER_SECONDS
    """Duração do buffer, em segundos. Fixa para todas as câmaras — não vem
    de dados guardados nem de input do cliente (ver camera_manager.py)."""

    class Config:
        from_attributes = True
