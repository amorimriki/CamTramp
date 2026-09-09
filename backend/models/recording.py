"""
Modelo Pydantic de uma gravação permanente (ver services/recording_manager.py).
"""

from datetime import datetime

from pydantic import BaseModel


class RecordingInfo(BaseModel):
    camera_id: int
    camera_name: str
    filename: str
    started_at: datetime
    size_bytes: int
    url: str
    """Caminho para descarregar/reproduzir o ficheiro (servido como
    ficheiro estático, ver main.py: app.mount("/recordings", ...))."""
