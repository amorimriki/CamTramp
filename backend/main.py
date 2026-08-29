"""
Ponto de entrada da aplicação FastAPI.

Para correr em desenvolvimento (a partir da pasta backend/):

    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Documentação interativa (Swagger):
    http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import cameras

app = FastAPI(
    title="CamTramp API",
    description="Sistema de análise de vídeo com buffer para câmaras RTSP.",
    version="0.1.0",
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


@app.get("/api/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
