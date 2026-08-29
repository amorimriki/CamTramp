"""
Modelos Pydantic relacionados com a Câmara.

Espelham a estrutura descrita no README (secção 5.3):

    id
    name
    rtsp_url
    buffer_seconds
    enabled
    created_at
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from config.settings import (
    DEFAULT_BUFFER_SECONDS,
    MIN_BUFFER_SECONDS,
    MAX_BUFFER_SECONDS,
)


class CameraBase(BaseModel):
    """Campos partilhados entre criação e leitura."""

    name: str = Field(..., min_length=1, max_length=80, description="Nome identificativo da câmara")
    rtsp_url: str = Field(..., description="URL RTSP da câmara, ex.: rtsp://192.168.1.230:554/0")
    buffer_seconds: int = Field(
        default=DEFAULT_BUFFER_SECONDS,
        ge=MIN_BUFFER_SECONDS,
        le=MAX_BUFFER_SECONDS,
        description="Duração do buffer de vídeo, em segundos",
    )
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
    buffer_seconds: Optional[int] = Field(default=None, ge=MIN_BUFFER_SECONDS, le=MAX_BUFFER_SECONDS)
    enabled: Optional[bool] = None


class Camera(CameraBase):
    """Câmara tal como é guardada/devolvida pela API."""

    id: int
    created_at: datetime

    class Config:
        from_attributes = True
