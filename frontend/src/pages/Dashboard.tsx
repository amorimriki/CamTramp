// Interface principal (README secção 7): grelha com o vídeo ao vivo
// de cada câmara configurada.

import { useEffect, useState } from 'react'
import { api } from '../api'
import { CameraCard } from '../components/CameraCard'
import type { Camera } from '../types'

export function Dashboard() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .listCameras()
      .then(setCameras)
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar câmaras'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="dashboard__status">A carregar...</div>
  if (error) return <div className="dashboard__status dashboard__status--error">{error}</div>

  if (cameras.length === 0) {
    return (
      <div className="dashboard__status">
        Ainda não há câmaras configuradas. Vai a "Configuração" para adicionar uma.
      </div>
    )
  }

  return (
    <div className="dashboard">
      <h2 className="visually-hidden">Câmaras</h2>
      {cameras.map((camera) => (
        <CameraCard key={camera.id} camera={camera} />
      ))}
    </div>
  )
}
