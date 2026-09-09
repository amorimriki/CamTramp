"""
Ponto de entrada da aplicação FastAPI.

Para correr em desenvolvimento (a partir da pasta backend/):

    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Documentação interativa (Swagger):
    http://localhost:8000/docs

Os segmentos/playlist HLS de cada câmara ficam expostos em:
    http://localhost:8000/streams/{camera_id}/stream.m3u8

Estado em tempo real (a correr + resumo do buffer) de todas as câmaras
via WebSocket, em vez de o frontend fazer polling HTTP:
    ws://localhost:8000/ws/status

Gravações automáticas e permanentes (últimos 20 minutos, em ficheiros
de 5 minutos) ficam expostas em:
    http://localhost:8000/recordings/{camera_id}/{ficheiro}.mp4
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

<<<<<<< Updated upstream
from api import buffer, cameras
from config.settings import BUFFER_DIR
from services import camera_manager, stream_manager
=======
from api import buffer, cameras, discovery, recordings, system, ws
from config.settings import BUFFER_DIR, RECORDINGS_DIR
from services import camera_manager, recording_manager, status_broadcaster, stream_manager
>>>>>>> Stashed changes


@asynccontextmanager
async def lifespan(app: FastAPI):
    BUFFER_DIR.mkdir(parents=True, exist_ok=True)
    # arranca logo o streaming das câmaras ativas, para o sistema já
    # ficar em direto assim que o servidor liga (ver README secção 17)
    camera_manager.start_all_enabled()
    # ciclo em segundo plano que envia o estado das câmaras a quem estiver
    # ligado a /ws/status (ver services/status_broadcaster.py)
    broadcast_task = asyncio.create_task(status_broadcaster.broadcast_loop())
    # ciclo em segundo plano que mantém só as últimas RECORDING_SEGMENTS_TO_KEEP
    # gravações por câmara (ver services/recording_manager.py)
    recordings_cleanup_task = asyncio.create_task(recording_manager.cleanup_loop())
    yield
    # ao desligar o backend, garante que nenhum processo FFmpeg fica órfão
    stream_manager.stop_all()
    broadcast_task.cancel()
    recordings_cleanup_task.cancel()


app = FastAPI(
    title="CamTramp API",
    description="Sistema de análise de vídeo com buffer para câmaras RTSP.",
    version="0.1.0",
    lifespan=lifespan,
)

# Em desenvolvimento o frontend (Vite) corre noutra porta/origem.
# Ajustar/restringir allow_origins antes de ir para produção.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cameras.router)
app.include_router(buffer.router)
<<<<<<< Updated upstream
=======
app.include_router(system.router)
app.include_router(discovery.router)
app.include_router(recordings.router)
app.include_router(ws.router)
>>>>>>> Stashed changes

# Serve os ficheiros .m3u8/.ts do buffer diretamente por HTTP (ver README secção 10)
BUFFER_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/streams", StaticFiles(directory=str(BUFFER_DIR)), name="streams")

# Serve as gravações permanentes (.mp4) diretamente por HTTP — é para lá que
# apontam os "url" da API /api/recordings (ver README secção "Gravações automáticas")
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/recordings", StaticFiles(directory=str(RECORDINGS_DIR)), name="recordings")


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
