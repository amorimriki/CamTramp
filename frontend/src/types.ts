// Tipos espelhando os modelos Pydantic do backend (backend/models/camera.py)
// e as respostas dos endpoints em backend/api/cameras.py e backend/api/buffer.py.
// buffer_seconds é sempre o valor fixo devolvido pela API (não é editável).

export interface Camera {
  id: number
  name: string
  rtsp_url: string
  buffer_seconds: number
  enabled: boolean
  created_at: string
}

export interface CameraInput {
  name: string
  rtsp_url: string
  enabled?: boolean
}

export interface StreamStatus {
  camera_id: number
  running: boolean
  hls_url: string | null
}

export interface BufferSummary {
  camera_id: number
  available: boolean
  segment_count: number
  duration_seconds: number
  buffer_start: string | null
  buffer_end: string | null
}

export interface TestConnectionResult {
  ok: boolean
  message: string
}

export interface NetworkInfo {
  ip: string
}

export interface DiscoveredDevice {
  ip: string
  port: number
  suggested_url: string
}

export interface ScanResult {
  devices: DiscoveredDevice[]
}
