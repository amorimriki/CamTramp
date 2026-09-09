// Ligação WebSocket única, partilhada por toda a app, para receber o
// estado (a correr + resumo do buffer) de todas as câmaras em tempo real
// (ver backend/api/ws.py e backend/services/status_broadcaster.py).
//
// Antes, cada CameraCard fazia o seu próprio polling HTTP a cada 1,5s.
// Agora há só esta ligação: os componentes subscrevem-se com
// useCameraStatus (ver useCameraStatus.ts) e recebem atualizações
// sempre que o backend as envia, sem pedidos repetidos.

import type { BufferSummary } from '../types'

export interface CameraStatusEntry {
  camera_id: number
  running: boolean
  buffer: BufferSummary | null
}

interface StatusMessage {
  type: string
  cameras: CameraStatusEntry[]
}

type Listener = (statuses: Map<number, CameraStatusEntry>) => void

let socket: WebSocket | null = null
let statuses = new Map<number, CameraStatusEntry>()
const listeners = new Set<Listener>()
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelayMs = 1000
const MAX_RECONNECT_DELAY_MS = 10_000

function notify() {
  for (const listener of listeners) listener(statuses)
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/ws/status`
  const ws = new WebSocket(url)
  socket = ws

  ws.onopen = () => {
    reconnectDelayMs = 1000
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as StatusMessage
      if (data.type !== 'status') return
      statuses = new Map(data.cameras.map((c) => [c.camera_id, c]))
      notify()
    } catch {
      // mensagem inesperada — ignora, mantém o último estado conhecido
    }
  }

  ws.onclose = () => {
    if (socket === ws) socket = null
    // mantém o último estado conhecido no ecrã e tenta religar com
    // backoff exponencial (evita bombardear o backend se ele estiver em
    // baixo ou a reiniciar)
    reconnectTimer = setTimeout(connect, reconnectDelayMs)
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
  }

  ws.onerror = () => {
    ws.close()
  }
}

/**
 * Subscreve atualizações de estado de todas as câmaras. A ligação
 * WebSocket só é aberta quando há pelo menos um subscritor, e fechada
 * quando o último se desinscreve (ex.: última CameraCard desmontada).
 */
export function subscribe(listener: Listener): () => void {
  if (!socket && !reconnectTimer) {
    connect()
  }
  listeners.add(listener)
  // entrega logo o estado conhecido até agora (pode estar vazio se ainda
  // não chegou nenhuma mensagem)
  listener(statuses)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      socket?.close()
      socket = null
    }
  }
}
