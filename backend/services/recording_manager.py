"""
Recording Manager — trata das gravações automáticas e permanentes
(README secção "Gravações automáticas"): lista os ficheiros .mp4
gerados pelo stream_manager (via o muxer "tee", ver lá) e faz a
rotação, mantendo só as últimas RECORDING_SEGMENTS_TO_KEEP por câmara.

Não há botão de "Guardar" nem seleção manual — enquanto uma câmara está
a correr, o FFmpeg já está sempre a escrever estes ficheiros; este
módulo só lê o que existe em disco e apaga o que for a mais.

O FFmpeg não sabe "rodar" ficheiros com nome por timestamp sozinho
(-segment_wrap só funciona com nomes numéricos %d, não com -strftime)
— por isso a rotação é feita aqui, num ciclo em segundo plano, e não
pelo próprio FFmpeg.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from config.settings import RECORDING_SEGMENTS_TO_KEEP, RECORDINGS_DIR
from models.recording import RecordingInfo
from services import camera_manager

# Ciclo de rotação: não precisa da cadência do status_broadcaster (1s) —
# só serve para não deixar acumular ficheiros indefinidamente. Além deste
# ciclo periódico, cleanup_once() é também chamado de imediato sempre que
# uma câmara arranca (ver services/camera_manager.start_stream) e uma vez
# no arranque do backend (ver main.py) — isto evita que, durante testes com
# muitos arranques/paragens seguidos da mesma câmara (cada um cria logo um
# novo ficheiro de gravação), o número de ficheiros em disco cresça acima
# do limite enquanto se espera pelo próximo tick deste ciclo.
CLEANUP_INTERVAL_SECONDS = 10

# Guarda-se sempre uma margem de 1 ficheiro acima de
# RECORDING_SEGMENTS_TO_KEEP: o mais recente pode ainda estar a ser
# escrito pelo FFmpeg neste preciso momento — apagar um ficheiro aberto
# perderia essa gravação silenciosamente, sem qualquer aviso.
_KEEP_WITH_MARGIN = RECORDING_SEGMENTS_TO_KEEP + 1

_TIMESTAMP_FORMAT = "%Y%m%d_%H%M%S"


def _parse_started_at(path: Path) -> Optional[datetime]:
    try:
        return datetime.strptime(path.stem, _TIMESTAMP_FORMAT)
    except ValueError:
        return None


def _camera_dirs() -> list[Path]:
    if not RECORDINGS_DIR.exists():
        return []
    return [d for d in RECORDINGS_DIR.iterdir() if d.is_dir()]


def _recordings_in(camera_dir: Path) -> list[Path]:
    """Ficheiros .mp4 válidos (nome no formato de timestamp esperado), do
    mais antigo para o mais recente — o nome já ordena cronologicamente."""
    files = [f for f in camera_dir.glob("*.mp4") if _parse_started_at(f) is not None]
    return sorted(files, key=lambda f: f.name)


def list_recordings(camera_id: Optional[int] = None) -> list[RecordingInfo]:
    """Lista as gravações guardadas, mais recentes primeiro. Se camera_id
    for indicado, só as dessa câmara."""
    dirs = [RECORDINGS_DIR / str(camera_id)] if camera_id is not None else _camera_dirs()

    recordings: list[RecordingInfo] = []
    for camera_dir in dirs:
        if not camera_dir.exists():
            continue
        cid = int(camera_dir.name)
        camera = camera_manager.get_camera(cid)
        camera_name = camera.name if camera else f"Câmara {cid}"

        for path in _recordings_in(camera_dir):
            started_at = _parse_started_at(path)
            if started_at is None:
                continue
            recordings.append(
                RecordingInfo(
                    camera_id=cid,
                    camera_name=camera_name,
                    filename=path.name,
                    started_at=started_at,
                    size_bytes=path.stat().st_size,
                    url=f"/recordings/{cid}/{path.name}",
                )
            )

    recordings.sort(key=lambda r: r.started_at, reverse=True)
    return recordings


def _cleanup_camera(camera_dir: Path) -> None:
    files = _recordings_in(camera_dir)
    excess = len(files) - _KEEP_WITH_MARGIN
    if excess <= 0:
        return
    for old_file in files[:excess]:
        old_file.unlink(missing_ok=True)


def cleanup_once() -> None:
    """Corre a rotação uma vez, para todas as câmaras com gravações."""
    for camera_dir in _camera_dirs():
        try:
            _cleanup_camera(camera_dir)
        except OSError as e:
            print(f"[recording_manager] erro a limpar gravações de '{camera_dir}': {e}")


async def cleanup_loop() -> None:
    """Ciclo em segundo plano: mantém só as últimas RECORDING_SEGMENTS_TO_KEEP
    gravações por câmara (+1 de margem para a que está a ser escrita neste
    momento). Arrancado como tarefa em segundo plano no lifespan do main.py."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(cleanup_once)
        except Exception as e:  # um erro pontual não deve matar o ciclo
            print(f"[recording_manager] erro no ciclo de limpeza: {e}")
