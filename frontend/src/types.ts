// Tipos espelhando os modelos Pydantic do backend (backend/models/camera.py)
// e as respostas dos endpoints em backend/api/cameras.py e backend/api/buffer.py.

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
  buffer_seconds: number
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
<<<<<<< Updated upstream
=======

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

// Espelha backend/models/recording.py — um ficheiro .mp4 gravado
// automaticamente (ver secção "Gravação automática" do README).
export interface RecordingInfo {
  camera_id: number
  camera_name: string
  filename: string
  started_at: string
  size_bytes: number
  url: string
}
>>>>>>> Stashed changes
