"""
Buffer Manager — expõe informação sobre o vídeo "passado" atualmente
disponível no buffer de uma câmara (ver README secção 6, "Buffer
Manager": Disponibilizar o vídeo passado).

A criação do buffer, o controlo da duração e a eliminação de
segmentos antigos já são geridos diretamente pelo FFmpeg (ver
services/stream_manager.py, "-hls_flags delete_segments"). Este
módulo só lê o playlist HLS gerado por esse processo e traduz os
segmentos disponíveis num resumo simples que o frontend usa para
mostrar a janela de "recuar no vídeo" (README secção 7).

O recuo em si é feito pelo próprio leitor HLS no browser: como o
playlist é do tipo "live" com uma janela deslizante, o hls.js já
permite navegar dentro do intervalo disponível (o "DVR window"). Não
é preciso reimplementar isso no backend — só informar o frontend de
que intervalo de tempo está disponível.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from services.stream_manager import playlist_path

_SEGMENT_DURATION_RE = re.compile(r"^#EXTINF:([\d.]+),?")
_PROGRAM_DATE_TIME_RE = re.compile(r"^#EXT-X-PROGRAM-DATE-TIME:(.+)$")


@dataclass
class BufferSegment:
    filename: str
    duration: float
    start_time: Optional[datetime]


@dataclass
class BufferSummary:
    camera_id: int
    available: bool
    segment_count: int = 0
    duration_seconds: float = 0.0
    buffer_start: Optional[datetime] = None
    buffer_end: Optional[datetime] = None


def _parse_datetime(raw: str) -> Optional[datetime]:
    raw = raw.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _parse_playlist(path: Path) -> list[BufferSegment]:
    """Lê um ficheiro .m3u8 (gerado pelo stream_manager) e devolve os segmentos disponíveis."""
    if not path.exists():
        return []

    segments: list[BufferSegment] = []
    pending_duration: Optional[float] = None
    pending_start: Optional[datetime] = None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        m = _PROGRAM_DATE_TIME_RE.match(line)
        if m:
            pending_start = _parse_datetime(m.group(1))
            continue

        m = _SEGMENT_DURATION_RE.match(line)
        if m:
            pending_duration = float(m.group(1))
            continue

        if line and not line.startswith("#"):
            # linha do nome do ficheiro do segmento (.ts)
            segments.append(
                BufferSegment(filename=line, duration=pending_duration or 0.0, start_time=pending_start)
            )
            pending_duration = None
            pending_start = None

    return segments


def get_summary(camera_id: int) -> BufferSummary:
    """Resumo do buffer atualmente disponível para uma câmara."""
    segments = _parse_playlist(playlist_path(camera_id))
    if not segments:
        return BufferSummary(camera_id=camera_id, available=False)

    total_duration = sum(s.duration for s in segments)
    timed_segments = [s for s in segments if s.start_time is not None]

    buffer_start = min(s.start_time for s in timed_segments) if timed_segments else None
    buffer_end = None
    if timed_segments:
        last = timed_segments[-1]
        buffer_end = last.start_time + timedelta(seconds=last.duration)

    return BufferSummary(
        camera_id=camera_id,
        available=True,
        segment_count=len(segments),
        duration_seconds=round(total_duration, 2),
        buffer_start=buffer_start,
        buffer_end=buffer_end,
    )
