"""
Ponto de entrada da aplicação FastAPI.

Para correr em desenvolvimento (a partir da pasta backend/):

    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Documentação interativa (Swagger):
    http://localhost:8000/docs

Os segmentos/playlist HLS de cada câmara ficam expostos em:
    http://localhost:8000/streams/{camera_id}/stream.m3u8
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api import buffer, cameras
from config.settings import BUFFER_DIR
from services import camera_manager, stream_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    BUFFER_DIR.mkdir(parents=True, exist_ok=True)
    # arranca logo o streaming das câmaras ativas, para o sistema já
    # ficar em direto assim que o servidor liga (ver README secção 17)
    camera_manager.start_all_enabled()
    yield
    # ao desligar o backend, garante que nenhum processo FFmpeg fica órfão
    stream_manager.stop_all()


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

# Serve os ficheiros .m3u8/.ts do buffer diretamente por HTTP (ver README secção 10)
BUFFER_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/streams", StaticFiles(directory=str(BUFFER_DIR)), name="streams")


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
