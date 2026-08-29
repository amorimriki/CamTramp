// Cliente HTTP simples para a API do backend (ver backend/api/*.py).
// Os caminhos são relativos ("/api/...") porque o Vite (em dev, ver
// vite.config.ts) e o Nginx (em produção, ver README secção 15) fazem
// proxy para o backend FastAPI.

import type {
  BufferSummary,
  Camera,
  CameraInput,
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
}
