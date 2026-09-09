"""
Difusão em tempo real do estado das câmaras via WebSocket.

Antes, cada CameraCard do frontend perguntava periodicamente ao backend,
por HTTP (a cada 1,5s, por câmara): "está a correr? quantos segmentos há
no buffer?" — com N câmaras abertas, isso são N x 2 pedidos HTTP a cada
1,5s, sempre, mesmo quando nada mudou.

Aqui é o backend que mantém a lista de ligações WebSocket ativas
(ConnectionManager) e lhes envia um "retrato" (snapshot) do estado de
todas as câmaras:

    - periodicamente, num ciclo em segundo plano (broadcast_loop,
      arrancado no lifespan do main.py) — isto cobre também uma câmara
      que caia sozinha (o FFmpeg morre sem ninguém ter carregado em
      "Parar"), sem depender de nenhum cliente estar a perguntar;
    - imediatamente a seguir a uma ação direta do utilizador (arrancar/
      parar o stream via API REST, ver api/buffer.py) — para a mudança
      de estado chegar ao ecrã quase de imediato, sem esperar pelo
      próximo tick do ciclo.

Isto substitui o polling do frontend por uma única ligação partilhada
entre todas as câmaras e todos os separadores/dispositivos com o
dashboard aberto — o custo de ler o .m3u8 de cada câmara passa a ser
pago uma vez por tick, independentemente de quantos clientes estão
ligados (antes era uma vez por cliente, por câmara, por poll).
"""

from __future__ import annotations

import asyncio

from fastapi import WebSocket

from services import buffer_manager, camera_manager, stream_manager

# Um pouco mais apertado que o antigo polling do frontend (1,5s) porque
# aqui o custo é pago uma única vez, partilhado por todos os clientes
# ligados, em vez de por cliente.
BROADCAST_INTERVAL_SECONDS = 1.0


class ConnectionManager:
    """Guarda as ligações WebSocket ativas e envia-lhes mensagens."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        # entrega logo o estado atual: sem isto, o cliente ficava às
        # escuras até ao próximo tick do broadcast_loop (até 1s de espera).
        await websocket.send_json(build_snapshot())

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        async with self._lock:
            connections = list(self._connections)
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                # ligação morta/instável (o browser fechou o separador sem
                # o close handshake chegar a tempo, por ex.) — remove-a, em
                # vez de voltar a tentar nos próximos ticks.
                await self.disconnect(websocket)


manager = ConnectionManager()


def build_snapshot() -> dict:
    """Estado atual (a correr + resumo do buffer) de todas as câmaras
    configuradas, no formato enviado pelo WebSocket.

    É código síncrono (lê ficheiros .m3u8 do disco, via buffer_manager) —
    quando chamado a partir de código assíncrono, correr sempre dentro de
    asyncio.to_thread para não bloquear o event loop.
    """
    cameras = []
    for camera in camera_manager.list_cameras():
        running = stream_manager.is_running(camera.id)
        buffer = None
        if running:
            summary = buffer_manager.get_summary(camera.id)
            buffer = {
                "camera_id": summary.camera_id,
                "available": summary.available,
                "segment_count": summary.segment_count,
                "duration_seconds": summary.duration_seconds,
                "buffer_start": summary.buffer_start.isoformat() if summary.buffer_start else None,
                "buffer_end": summary.buffer_end.isoformat() if summary.buffer_end else None,
            }
        cameras.append({"camera_id": camera.id, "running": running, "buffer": buffer})
    return {"type": "status", "cameras": cameras}


async def broadcast_now() -> None:
    """Calcula o estado atual e envia-o já a todos os clientes ligados —
    chamado a seguir a uma ação direta (arrancar/parar), para não esperar
    pelo próximo tick do broadcast_loop."""
    snapshot = await asyncio.to_thread(build_snapshot)
    await manager.broadcast(snapshot)


async def broadcast_loop() -> None:
    """Ciclo em segundo plano: envia o estado de todas as câmaras a todos
    os clientes ligados a cada BROADCAST_INTERVAL_SECONDS. Corre sempre,
    mesmo sem nenhum cliente ligado (broadcast() não faz nada nesse caso).
    Arrancado como tarefa em segundo plano no lifespan do main.py."""
    while True:
        await asyncio.sleep(BROADCAST_INTERVAL_SECONDS)
        try:
            await broadcast_now()
        except Exception as e:  # um erro pontual não deve matar o ciclo
            print(f"[status_broadcaster] erro no ciclo de difusão: {e}")
