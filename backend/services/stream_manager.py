"""
Stream Manager — liga-se a uma câmara RTSP via FFmpeg e gera os
segmentos HLS que alimentam o buffer de vídeo (ver README secções 3,
4 e 10).

Para cada câmara mantém-se um processo FFmpeg que:
    - Recebe o stream RTSP (via TCP, mais fiável em Wi-Fi que UDP).
    - Deteta o codec de vídeo da câmara (via ffprobe) antes de arrancar:
      se já for H.264, copia sem reencodificar (-c:v copy), poupando CPU
      na Raspberry Pi; caso contrário (ex.: câmaras que enviam HEVC/H.265,
      que a maioria dos browsers exceto o Safari não sabe descodificar
      via MSE), transcodifica automaticamente para H.264.
    - Gera segmentos .ts de SEGMENT_SECONDS num playlist .m3u8.
    - Mantém apenas os últimos `buffer_seconds / SEGMENT_SECONDS`
      segmentos (hls_flags delete_segments), o que implementa
      diretamente a "janela deslizante" descrita no README secção 3.

Este módulo não sabe nada de HTTP/FastAPI — só gere processos FFmpeg
e ficheiros em disco. É usado por services/camera_manager.py.

Nota (V1, README secção 14): sem áudio (-an) e sem tracking entre
câmaras — isso fica para versões futuras (V3/V4).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from config.settings import BUFFER_DIR, FFMPEG_BINARY, FFPROBE_BINARY, LOGS_DIR, MAX_TRANSCODE_WIDTH, SEGMENT_SECONDS

_lock = threading.Lock()
_processes: dict[int, subprocess.Popen] = {}


class FFmpegNotFoundError(RuntimeError):
    """FFmpeg não está instalado ou não foi encontrado no PATH."""


@dataclass
class StreamInfo:
    camera_id: int
    running: bool
    playlist_path: Path
    pid: Optional[int] = None


def _camera_dir(camera_id: int) -> Path:
    d = BUFFER_DIR / str(camera_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def playlist_path(camera_id: int) -> Path:
    return _camera_dir(camera_id) / "stream.m3u8"


def _hls_list_size(buffer_seconds: int) -> int:
    """Número de segmentos HLS a manter para cobrir buffer_seconds."""
    return max(1, buffer_seconds // SEGMENT_SECONDS)


def _detect_video_codec(rtsp_url: str, timeout: float = 5.0) -> Optional[str]:
    """Deteta o codec de vídeo da câmara via ffprobe. Devolve None se não
    for possível detetar (câmara em baixo, timeout, ffprobe em falta,
    etc.) — nesse caso assume-se o pior caso (transcodificar) em vez de
    arriscar enviar um stream que o browser não consiga tocar."""
    if shutil.which(FFPROBE_BINARY) is None:
        return None
    cmd = [
        FFPROBE_BINARY,
        "-v", "error",
        "-rtsp_transport", "tcp",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name",
        "-of", "json",
        rtsp_url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    streams = data.get("streams", [])
    return streams[0].get("codec_name") if streams else None


def _video_codec_args(rtsp_url: str, camera_id: int) -> list[str]:
    """Escolhe copiar o vídeo (rápido, sem custo de CPU) ou transcodificar
    para H.264 (compatibilidade universal no browser). A maioria dos
    browsers (exceto o Safari) não sabe descodificar HEVC/H.265 via MSE,
    por isso é preciso transcodificar quando a câmara envia HEVC — ou
    quando não foi possível confirmar que já é H.264."""
    codec = _detect_video_codec(rtsp_url)
    if codec == "h264":
        print(f"[stream_manager] câmara {camera_id}: codec h264 detetado -> a copiar sem reencodificar")
        return ["-c:v", "copy"]

    print(
        f"[stream_manager] câmara {camera_id}: codec '{codec or 'desconhecido'}' "
        "-> a transcodificar para h264 (mais CPU, mas toca em qualquer browser)"
    )
    # "ultrafast" em vez de "veryfast": muito menos CPU por segundo de vídeo
    # (troca por ficheiros um pouco maiores, irrelevante numa rede local).
    # Se o CPU não conseguir acompanhar em tempo real, o sintoma é
    # exatamente demora crescente + engasgos no player.
    #
    # -vf scale limita a largura a MAX_TRANSCODE_WIDTH: o custo de
    # descodificar+codificar cresce com o nº de pixels, por isso reduzir a
    # resolução ajuda muito mais o CPU do que baixar o preset sozinho. Não
    # se aplica ao caminho -c:v copy (h264 nativo), só quando já estamos a
    # reencodificar de qualquer forma.
    #
    # -force_key_frames é essencial aqui: o -hls_time só consegue cortar um
    # segmento num keyframe, e sem isto o libx264 usa o seu GOP por omissão
    # (~10s), o que faz os segmentos saírem bem mais longos do que
    # SEGMENT_SECONDS pede — desalinhando hls_list_size do buffer_seconds
    # real da câmara. Isto força um keyframe exatamente a cada
    # SEGMENT_SECONDS, para os cortes dos segmentos HLS caírem onde devem.
    return [
        "-vf", f"scale='min({MAX_TRANSCODE_WIDTH},iw)':-2",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})",
    ]


def _build_ffmpeg_command(rtsp_url: str, camera_id: int, buffer_seconds: int) -> list[str]:
    camera_dir = _camera_dir(camera_id)
    list_size = _hls_list_size(buffer_seconds)
    return [
        FFMPEG_BINARY,
        "-loglevel", "warning",
        "-stats",
        "-rtsp_transport", "tcp",
        # tolerância a pacotes perdidos/corrompidos vindos da câmara (comum em
        # Wi-Fi com sinal fraco): descarta o que vier danificado em vez de
        # deixar isso propagar-se e estragar mais frames a seguir.
        "-fflags", "+discardcorrupt",
        "-err_detect", "ignore_err",
        "-i", rtsp_url,
        "-an",                      # V1: sem áudio, só interessa o vídeo
        *_video_codec_args(rtsp_url, camera_id),
        "-f", "hls",
        "-hls_time", str(SEGMENT_SECONDS),
        "-hls_list_size", str(list_size),
        "-hls_flags", "delete_segments+append_list+omit_endlist+program_date_time",
        "-hls_segment_filename", str(camera_dir / "segment_%05d.ts"),
        str(playlist_path(camera_id)),
    ]


def is_running(camera_id: int) -> bool:
    """Verifica o estado da câmara, limpando o registo se o processo já morreu."""
    with _lock:
        proc = _processes.get(camera_id)
        if proc is None:
            return False
        if proc.poll() is not None:
            # o processo terminou entretanto (ex.: câmara offline, URL inválido)
            _processes.pop(camera_id, None)
            return False
        return True


def start(camera_id: int, rtsp_url: str, buffer_seconds: int) -> StreamInfo:
    """Arranca o FFmpeg para a câmara, se ainda não estiver a correr."""
    if shutil.which(FFMPEG_BINARY) is None:
        raise FFmpegNotFoundError(
            f"'{FFMPEG_BINARY}' não encontrado no PATH. "
            "Na Raspberry Pi: sudo apt install ffmpeg"
        )

    with _lock:
        existing = _processes.get(camera_id)
        if existing is not None and existing.poll() is None:
            return StreamInfo(camera_id, True, playlist_path(camera_id), existing.pid)

        camera_dir = _camera_dir(camera_id)
        # limpa segmentos/playlist de uma sessão anterior antes de arrancar de novo
        for f in camera_dir.glob("*"):
            f.unlink(missing_ok=True)

        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_file = open(LOGS_DIR / f"camera_{camera_id}.log", "a", encoding="utf-8")

        cmd = _build_ffmpeg_command(rtsp_url, camera_id, buffer_seconds)
        proc = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT)
        _processes[camera_id] = proc

    return StreamInfo(camera_id, True, playlist_path(camera_id), proc.pid)


def stop(camera_id: int, timeout: float = 5.0) -> bool:
    """Para o FFmpeg da câmara, se estiver a correr. Devolve True se algo foi parado."""
    with _lock:
        proc = _processes.pop(camera_id, None)

    if proc is None or proc.poll() is not None:
        return False

    proc.terminate()
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    return True


def get_info(camera_id: int) -> StreamInfo:
    running = is_running(camera_id)
    proc = _processes.get(camera_id)
    return StreamInfo(camera_id, running, playlist_path(camera_id), proc.pid if proc else None)


def stop_all() -> None:
    """Para todos os streams ativos (chamado no shutdown do backend)."""
    for camera_id in list(_processes.keys()):
        stop(camera_id)


def test_connection(rtsp_url: str, timeout: float = 5.0) -> tuple[bool, str]:
    """Testa a ligação RTSP com ffprobe, sem arrancar o buffer (ver README
    secção 8, botão "TESTAR"). Devolve (ok, mensagem)."""
    if shutil.which(FFPROBE_BINARY) is None:
        raise FFmpegNotFoundError(
            f"'{FFPROBE_BINARY}' não encontrado no PATH. "
            "Na Raspberry Pi: sudo apt install ffmpeg"
        )

    cmd = [
        FFPROBE_BINARY,
        "-v", "error",
        "-rtsp_transport", "tcp",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height",
        "-of", "json",
        rtsp_url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False, f"Sem resposta em {timeout:.0f}s (timeout)"

    if result.returncode != 0:
        stderr_lines = (result.stderr or "").strip().splitlines()
        return False, stderr_lines[-1] if stderr_lines else "Falha desconhecida ao ligar"

    import json

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return False, "Resposta inesperada do ffprobe"

    streams = data.get("streams", [])
    if not streams:
        return False, "Nenhum stream de vídeo encontrado"

    s = streams[0]
    return True, f"OK ({s.get('codec_name', '?')} {s.get('width', '?')}x{s.get('height', '?')})"
