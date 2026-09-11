// Cliente HTTP simples para a API do backend (ver backend/api/*.py).
// Os caminhos são relativos ("/api/...") porque o Vite (em dev, ver
// vite.config.ts) e o Nginx (em produção, ver README secção 15) fazem
// proxy para o backend FastAPI.

import type {
  BufferSummary,
  Camera,
  CameraInput,
  NetworkInfo,
  RecordingInfo,
  RestartResult,
  ScanResult,
  StreamStatus,
  TestConnectionResult,
} from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // resposta sem corpo JSON (ex.: erro de rede antes de chegar ao backend)
    }
    throw new Error(detail)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  listCameras: () => request<Camera[]>('/api/cameras'),
  getCamera: (id: number) => request<Camera>(`/api/cameras/${id}`),
  createCamera: (data: CameraInput) =>
    request<Camera>('/api/cameras', { method: 'POST', body: JSON.stringify(data) }),
  updateCamera: (id: number, data: Partial<CameraInput>) =>
    request<Camera>(`/api/cameras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCamera: (id: number) => request<void>(`/api/cameras/${id}`, { method: 'DELETE' }),

  testConnection: (rtsp_url: string) =>
    request<TestConnectionResult>('/api/cameras/test', {
      method: 'POST',
      body: JSON.stringify({ rtsp_url }),
    }),

  streamStatus: (id: number) => request<StreamStatus>(`/api/cameras/${id}/stream`),
  startStream: (id: number) =>
    request<StreamStatus>(`/api/cameras/${id}/stream/start`, { method: 'POST' }),
  stopStream: (id: number) =>
    request<StreamStatus>(`/api/cameras/${id}/stream/stop`, { method: 'POST' }),

  bufferSummary: (id: number) => request<BufferSummary>(`/api/cameras/${id}/buffer`),

  // IP local (LAN) desta máquina, para mostrar como código QR (ver
  // components/NetworkAccess.tsx e backend/api/system.py).
  networkInfo: () => request<NetworkInfo>('/api/system/network'),

  // Descoberta automática de câmaras na rede local via nmap (ver
  // components/CameraForm.tsx e backend/api/discovery.py). Pode demorar
  // alguns segundos.
  discoverDevices: () => request<ScanResult>('/api/discovery/scan'),

  // Gravações automáticas dos últimos 20 min (ver pages/Recordings.tsx e
  // backend/api/recordings.py). camera_id opcional filtra por câmara.
  listRecordings: (camera_id?: number) =>
    request<RecordingInfo[]>(
      camera_id === undefined ? '/api/recordings' : `/api/recordings?camera_id=${camera_id}`
    ),

  // Reinicia o backend+frontend (só funciona instalado como serviço
  // systemd --user, ver backend/api/system.py e README secção 10). Tal
  // como stopApp/resetApp, pede sempre a password de administração
  // (ADMIN_ACTION_PASSWORD em backend/config/settings.py).
  restartApp: (password: string) =>
    request<RestartResult>('/api/system/restart', { method: 'POST', body: JSON.stringify({ password }) }),

  // Para o backend+frontend e fecha a aplicação (não volta a arrancar
  // sozinho, ao contrário do restart) — mesmo requisito de serviço
  // systemd --user.
  stopApp: (password: string) =>
    request<RestartResult>('/api/system/stop', { method: 'POST', body: JSON.stringify({ password }) }),

  // Apaga todas as câmaras guardadas, os logs de FFmpeg, as gravações
  // permanentes e o buffer de vídeo. Funciona também em desenvolvimento,
  // ao contrário de restart/stop.
  resetApp: (password: string) =>
    request<RestartResult>('/api/system/reset', { method: 'POST', body: JSON.stringify({ password }) }),

  // Só confirma a password de administração, sem executar nenhuma ação —
  // usado para abrir o card de administração (ver Settings.tsx).
  checkAdminPassword: (password: string) =>
    request<RestartResult>('/api/system/check-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // Instala o arranque automático (serviço systemd --user + autostart do
  // browser + desativa suspensão do sistema — README secção 10). Devolve
  // o output completo do script em `output`.
  installAutostart: (password: string) =>
    request<RestartResult>('/api/system/install-autostart', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // Remove tudo o que installAutostart instalou.
  uninstallAutostart: (password: string) =>
    request<RestartResult>('/api/system/uninstall-autostart', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
}
