"""
Camada de acesso a dados baseada em ficheiro JSON.

Nesta primeira versão do projeto (ver README, secção 5.3) optou-se por
não usar SQLite, mas sim um único ficheiro JSON como "base de dados".
É suficiente para guardar a configuração de um número reduzido de
câmaras e mantém a implementação simples durante o desenvolvimento.
Mais tarde, se necessário, esta camada pode ser substituída por SQLite
sem alterar a forma como o resto do backend acede aos dados (basta
manter as mesmas funções: get_cameras, get_camera, create_camera,
update_camera, delete_camera).

Estrutura do ficheiro (db.json):

{
  "next_id": 2,
  "cameras": [
    {
      "id": 1,
      "name": "Trampolim 1",
      "rtsp_url": "rtsp://192.168.1.230:554/0",
      "buffer_seconds": 30,
      "enabled": true,
      "created_at": "2026-08-29T13:30:12.123456"
    }
  ]
}

Todas as operações de escrita são feitas de forma atómica (escreve-se
para um ficheiro temporário e faz-se rename) e protegidas por um lock,
para evitar corrupção de dados em caso de acessos concorrentes.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from typing import Any, Optional

from config.settings import DB_FILE

_lock = threading.Lock()

_EMPTY_DB: dict[str, Any] = {
    "next_id": 1,
    "cameras": [],
}


def _ensure_db_file() -> None:
    """Garante que a diretoria e o ficheiro JSON existem."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DB_FILE.exists():
        _write(_EMPTY_DB)


def _read() -> dict[str, Any]:
    _ensure_db_file()
    with open(DB_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            # Ficheiro vazio ou corrompido: recomeça com uma base de dados vazia
            return dict(_EMPTY_DB)


def _write(data: dict[str, Any]) -> None:
    """Escreve o ficheiro de forma atómica (evita corrupção em caso de falha a meio da escrita)."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = f"{DB_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    os.replace(tmp_path, DB_FILE)


# --------------------------------------------------------------------------
# API de câmaras
# --------------------------------------------------------------------------

def get_cameras() -> list[dict[str, Any]]:
    """Devolve todas as câmaras."""
    with _lock:
        return _read()["cameras"]


def get_camera(camera_id: int) -> Optional[dict[str, Any]]:
    """Devolve uma câmara pelo id, ou None se não existir."""
    with _lock:
        data = _read()
    for camera in data["cameras"]:
        if camera["id"] == camera_id:
            return camera
    return None


def create_camera(camera_data: dict[str, Any]) -> dict[str, Any]:
    """Cria uma nova câmara e devolve o registo criado."""
    with _lock:
        data = _read()
        new_camera = {
            "id": data["next_id"],
            "created_at": datetime.now().isoformat(),
            **camera_data,
        }
        data["cameras"].append(new_camera)
        data["next_id"] += 1
        _write(data)
        return new_camera


def update_camera(camera_id: int, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Atualiza os campos fornecidos (não-None) de uma câmara existente."""
    with _lock:
        data = _read()
        for camera in data["cameras"]:
            if camera["id"] == camera_id:
                camera.update({k: v for k, v in updates.items() if v is not None})
                _write(data)
                return camera
        return None


def delete_camera(camera_id: int) -> bool:
    """Remove uma câmara. Devolve True se algo foi removido."""
    with _lock:
        data = _read()
        original_len = len(data["cameras"])
        data["cameras"] = [c for c in data["cameras"] if c["id"] != camera_id]
        if len(data["cameras"]) == original_len:
            return False
        _write(data)
        return True
