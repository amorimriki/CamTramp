"""
WebSocket para o estado em tempo real das câmaras:

    WS /ws/status

Substitui o polling HTTP que o frontend fazia a cada 1,5s por câmara
(GET .../stream + GET .../buffer) por uma única ligação partilhada que
recebe um "retrato" do estado de todas as câmaras sempre que muda (ver
services/status_broadcaster.py para a lógica de difusão).
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services import status_broadcaster

router = APIRouter(tags=["status"])


@router.websocket("/ws/status")
async def status_socket(websocket: WebSocket) -> None:
    await status_broadcaster.manager.connect(websocket)
    try:
        while True:
            # Não esperamos nenhuma mensagem do cliente — isto só serve
            # para detetar a desconexão (WebSocketDisconnect) sem termos
            # de fazer polling ativo à ligação.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await status_broadcaster.manager.disconnect(websocket)
